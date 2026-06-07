// frontend/src/worker/aggregator.ts
// Maintains a ring buffer of spans and computes render-ready aggregates:
// heatmap matrix, percentile series, throughput series.
// This is the engine room — main thread never sees individual spans.

import type { Span } from "./generator";
import type {
  FilterState,
  WindowRange,
  HeatmapMatrix,
  PercentileSeries,
  ThroughputSeries,
  FrameData,
  DrillDownSpan,
} from "./types";

// ── Configuration ──────────────────────────────────────────────────────────

/** Number of time buckets in the heatmap and series. */
const TIME_BUCKETS = 60;

/** Number of latency buckets in the heatmap. */
const LATENCY_BUCKETS = 30;

/** Latency range for the heatmap (0–1000ms). */
const MAX_LATENCY_MS = 1000;

/** Max spans retained in the ring buffer (≈10s at 1000/s). */
const RING_CAPACITY = 100_000;

// ── Aggregator ─────────────────────────────────────────────────────────────

export class Aggregator {
  private ring: Span[] = [];
  private ringHead = 0;
  private ringCount = 0;

  private filter: FilterState = {
    services: [],
    endpoints: [],
    statusClasses: [],
  };

  ingest(spans: Span[]) {
    for (const sp of spans) {
      this.ring[this.ringHead] = sp;
      this.ringHead = (this.ringHead + 1) % RING_CAPACITY;
      if (this.ringCount < RING_CAPACITY) this.ringCount++;
    }
  }

  setFilter(f: FilterState) {
    this.filter = f;
  }

  /** Get all spans in the ring for a given filter, newest-first window. */
  private filteredSpans(window: WindowRange): Span[] {
    const { startMs, endMs } = window;
    const result: Span[] = [];
    const { services, endpoints, statusClasses, minLatencyMs, maxLatencyMs } =
      this.filter;

    // Walk the ring from newest to oldest.
    // Early-break when we pass the window start (spans are time-ordered).
    let idx = this.ringHead;
    for (let i = 0; i < this.ringCount; i++) {
      idx = (idx - 1 + RING_CAPACITY) % RING_CAPACITY;
      const sp = this.ring[idx];
      if (!sp) continue;

      // Newest-to-oldest: once ts < startMs, remaining are all older — break.
      if (sp.ts < startMs) break;

      if (sp.ts > endMs) continue;

      // Apply filters
      if (services.length > 0 && !services.includes(sp.service)) continue;
      if (endpoints.length > 0 && !endpoints.includes(sp.endpoint)) continue;
      if (statusClasses.length > 0) {
        const cls = statusClass(sp.status);
        if (!statusClasses.includes(cls)) continue;
      }
      if (minLatencyMs !== undefined && sp.latencyMs < minLatencyMs) continue;
      if (maxLatencyMs !== undefined && sp.latencyMs > maxLatencyMs) continue;

      result.push(sp);
    }

    return result.reverse(); // chronological
  }

  /**
   * Compute a full FrameData from the current ring + window.
   * Called on each RAF tick by the worker.
   */
  computeFrame(window: WindowRange): FrameData {
    const spans = this.filteredSpans(window);
    const startMs = window.startMs;
    const endMs = window.endMs;

    // ── Heatmap ────────────────────────────────────────────────────────
    const heatmap = buildHeatmap(spans, startMs, endMs);

    // ── Percentiles ────────────────────────────────────────────────────
    const percentiles = buildPercentiles(spans, startMs, endMs);

    // ── Throughput ─────────────────────────────────────────────────────
    const throughput = buildThroughput(spans, startMs, endMs);

    return {
      type: "frame",
      windowStartMs: startMs,
      windowEndMs: endMs,
      heatmap,
      percentiles,
      throughput,
    };
  }

  /** Number of spans currently in the ring. */
  get size(): number {
    return this.ringCount;
  }

  /**
   * Query raw spans matching a specific time + latency bucket.
   * Returns up to `maxResults` spans plus total count.
   */
  queryCell(
    timeRange: [number, number],
    latencyRange: [number, number],
    maxResults: number
  ): { totalCount: number; spans: DrillDownSpan[] } {
    const [tLo, tHi] = timeRange;
    const [latLo, latHi] = latencyRange;
    const spans: DrillDownSpan[] = [];
    let totalCount = 0;

    let idx = this.ringHead;
    for (let i = 0; i < this.ringCount; i++) {
      idx = (idx - 1 + RING_CAPACITY) % RING_CAPACITY;
      const sp = this.ring[idx];
      if (!sp) continue;
      if (sp.ts < tLo) break; // ring is time-ordered newest-first, safe to break
      if (sp.ts > tHi) continue;
      if (sp.latencyMs < latLo || sp.latencyMs >= latHi) continue;

      totalCount++;
      if (spans.length < maxResults) {
        spans.push({
          ts: sp.ts,
          service: sp.service,
          endpoint: sp.endpoint,
          latencyMs: sp.latencyMs,
          status: sp.status,
          traceId: sp.traceId,
        });
      }
    }

    return {
      totalCount,
      spans,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusClass(status: number): "2xx" | "3xx" | "4xx" | "5xx" {
  if (status < 200) return "2xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}

function latencyBucket(latMs: number): number {
  // Log-ish buckets: more resolution at low latencies
  const idx = Math.floor(
    (Math.log(latMs + 1) / Math.log(MAX_LATENCY_MS + 1)) * (LATENCY_BUCKETS - 1)
  );
  return Math.min(idx, LATENCY_BUCKETS - 1);
}

function latencyEdge(bucket: number): number {
  return Math.pow(MAX_LATENCY_MS + 1, (bucket + 1) / (LATENCY_BUCKETS - 1)) - 1;
}

function buildHeatmap(spans: Span[], startMs: number, endMs: number): HeatmapMatrix {
  const cols = TIME_BUCKETS;
  const rows = LATENCY_BUCKETS;
  const values = new Float32Array(rows * cols);
  const timeCentersMs = bucketCenters(startMs, endMs, cols);
  const timeEdgesMs = bucketEdges(startMs, endMs, cols);
  const latencyEdgeMs = Array.from({ length: rows + 1 }, (_, i) =>
    i === 0 ? 0 : latencyEdge(i - 1)
  );
  const bucketMs = (endMs - startMs) / cols;

  for (const sp of spans) {
    const t = Math.min(Math.floor((sp.ts - startMs) / bucketMs), cols - 1);
    const l = latencyBucket(sp.latencyMs);
    if (t >= 0 && t < cols) {
      values[l * cols + t] += 1;
    }
  }

  return {
    rows,
    cols,
    latencyEdgesMs: latencyEdgeMs,
    timeCentersMs: timeCentersMs,
    timeEdgesMs: timeEdgesMs,
    values,
  };
}

function buildPercentiles(
  spans: Span[],
  startMs: number,
  endMs: number
): PercentileSeries {
  const cols = TIME_BUCKETS;
  const bucketMs = (endMs - startMs) / cols;
  const timeCentersMs = bucketCenters(startMs, endMs, cols);

  // Bucket latencies
  const buckets: number[][] = Array.from({ length: cols }, () => []);
  for (const sp of spans) {
    const t = Math.min(Math.floor((sp.ts - startMs) / bucketMs), cols - 1);
    if (t >= 0) buckets[t].push(sp.latencyMs);
  }

  const p50 = new Float32Array(cols);
  const p95 = new Float32Array(cols);
  const p99 = new Float32Array(cols);

  for (let i = 0; i < cols; i++) {
    const b = buckets[i];
    if (b.length === 0) continue;
    b.sort((a, b) => a - b);
    p50[i] = percentile(b, 50);
    p95[i] = percentile(b, 95);
    p99[i] = percentile(b, 99);
  }

  return { timeCentersMs: timeCentersMs, p50, p95, p99 };
}

function buildThroughput(
  spans: Span[],
  startMs: number,
  endMs: number
): ThroughputSeries {
  const cols = TIME_BUCKETS;
  const bucketMs = (endMs - startMs) / cols;
  const timeCentersMs = bucketCenters(startMs, endMs, cols);

  const totalCounts = new Uint32Array(cols);
  const errCounts = new Uint32Array(cols);

  for (const sp of spans) {
    const t = Math.min(Math.floor((sp.ts - startMs) / bucketMs), cols - 1);
    if (t < 0) continue;
    totalCounts[t]++;
    if (sp.status >= 500) errCounts[t]++;
  }

  const spanSec = (endMs - startMs) / 1000;
  const scale = 1 / (spanSec / cols);
  const spansPerSec = new Float32Array(cols);
  const errorsPerSec = new Float32Array(cols);
  for (let i = 0; i < cols; i++) {
    spansPerSec[i] = totalCounts[i] * scale;
    errorsPerSec[i] = errCounts[i] * scale;
  }

  return { timeCentersMs: timeCentersMs, spansPerSec, errorsPerSec };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const k = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  if (lo === hi) return sorted[lo];
  const frac = k - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

function bucketCenters(start: number, end: number, n: number): number[] {
  const step = (end - start) / n;
  return Array.from({ length: n }, (_, i) => start + step * (i + 0.5));
}

function bucketEdges(start: number, end: number, n: number): number[] {
  const step = (end - start) / n;
  return Array.from({ length: n + 1 }, (_, i) => start + step * i);
}
