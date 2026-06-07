// frontend/src/worker/index.ts
// Web Worker entry point.
// Owns the generator + aggregator + render loop.
// Main thread never touches raw spans — only receives render-ready frames.

import { SpanGenerator } from "./generator";
import { Aggregator } from "./aggregator";
import type { MainToWorkerMessage, WindowRange } from "./types";

// ── State ──────────────────────────────────────────────────────────────────

const generator = new SpanGenerator();
const aggregator = new Aggregator();

const WINDOW_SPAN_MS = 30_000;
const windowRange: WindowRange = {
  startMs: Date.now() - WINDOW_SPAN_MS,
  endMs: Date.now(),
  follow: true,
};

let paused = false;
let emitRate = 200; // spans per second
let frameCount = 0;
let spanCount = 0;

// ── Generator tick ─────────────────────────────────────────────────────────

let lastGen = performance.now();
const GEN_INTERVAL = 50; // ms between generation batches

function tickGenerator() {
  const now = performance.now();
  if (now - lastGen < GEN_INTERVAL) return;
  lastGen = now;

  const batchSize = Math.round(emitRate / (1000 / GEN_INTERVAL));
  const spans = generator.generate(Math.max(1, batchSize));
  aggregator.ingest(spans);
  spanCount += spans.length;
}

// ── Render loop ────────────────────────────────────────────────────────────

function render() {
  // Keep window pinned to now when following
  if (windowRange.follow && !paused) {
    const now = Date.now();
    windowRange.startMs = now - WINDOW_SPAN_MS;
    windowRange.endMs = now;
  }

  if (!paused) {
    tickGenerator();

    const frame = aggregator.computeFrame(windowRange);
    frameCount++;

    // Transfer underlying buffers for zero-copy
    const transferables: Transferable[] = [
      frame.heatmap.values.buffer,
      frame.percentiles.p50.buffer,
      frame.percentiles.p95.buffer,
      frame.percentiles.p99.buffer,
      frame.throughput.spansPerSec.buffer,
      frame.throughput.errorsPerSec.buffer,
    ];

    self.postMessage(frame, { transfer: transferables });

    // Stats every ~30 frames
    if (frameCount % 30 === 0) {
      self.postMessage({
        type: "stats",
        spansGeneratedTotal: spanCount,
        spansPerSec: emitRate,
        framesEmittedTotal: frameCount,
        droppedSpans: 0,
      });
    }
  }

  requestAnimationFrame(render);
}

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = (ev: MessageEvent<MainToWorkerMessage>) => {
  const msg = ev.data;

  switch (msg.type) {
    case "set_window":
      windowRange.startMs = msg.range.startMs;
      windowRange.endMs = msg.range.endMs;
      windowRange.follow = msg.range.follow;
      break;

    case "set_filters":
      aggregator.setFilter(msg.filters);
      break;

    case "pause":
      paused = true;
      break;

    case "resume":
      paused = false;
      break;

    case "set_rate":
      emitRate = msg.spansPerSec;
      break;

    case "inject_anomaly":
      generator.triggerAnomaly(msg.kind);
      break;

    case "query_cell": {
      const result = aggregator.queryCell(
        msg.timeRange,
        msg.latencyRange,
        100
      );
      self.postMessage({
        type: "cell_result",
        queryId: msg.queryId,
        count: result.totalCount,
        spans: result.spans,
      });
      break;
    }
  }
};

// ── Boot ───────────────────────────────────────────────────────────────────

self.postMessage({
  type: "stats",
  spansGeneratedTotal: 0,
  spansPerSec: 0,
  framesEmittedTotal: 0,
  droppedSpans: 0,
});

requestAnimationFrame(render);
