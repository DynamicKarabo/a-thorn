// frontend/src/worker/types.ts
// Message contract shared between the main thread and the trace-aggregation Web Worker.

/** Status-class buckets used for error-rate breakdowns. */
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx";

/** Active filter state applied to the incoming span stream. */
export interface FilterState {
  services: string[];
  endpoints: string[];
  statusClasses: StatusClass[];
  minLatencyMs?: number;
  maxLatencyMs?: number;
}

/** Visible time window, in unix-ms. */
export interface WindowRange {
  startMs: number;
  endMs: number;
  /** Whether the window should follow live data (right edge pinned to now). */
  follow: boolean;
}

// ---------------------------------------------------------------------------
// Worker state controls (main thread -> worker)
// ---------------------------------------------------------------------------

export interface SetWindowMsg {
  type: "set_window";
  range: WindowRange;
}

export interface SetFiltersMsg {
  type: "set_filters";
  filters: FilterState;
}

export interface PauseMsg {
  type: "pause";
}

export interface ResumeMsg {
  type: "resume";
}

export interface SetRateMsg {
  type: "set_rate";
  spansPerSec: number;
}

export interface InjectAnomalyMsg {
  type: "inject_anomaly";
  kind: "spike" | "error_burst";
}

export type MainToWorkerMessage =
  | SetWindowMsg
  | SetFiltersMsg
  | PauseMsg
  | ResumeMsg
  | SetRateMsg
  | InjectAnomalyMsg
  | QueryCellMsg;

// ---------------------------------------------------------------------------
// Worker output (worker -> main thread)
// ---------------------------------------------------------------------------

export interface QueryCellMsg {
  type: "query_cell";
  queryId: number;
  timeRange: [number, number];
  latencyRange: [number, number];
}

export interface DrillDownSpan {
  ts: number;
  service: string;
  endpoint: string;
  latencyMs: number;
  status: number;
  traceId: string;
}

export interface DrillDownResult {
  type: "cell_result";
  queryId: number;
  count: number;
  spans: DrillDownSpan[];
}

/** Render-ready latency heatmap.
 * `values` is row-major: rows = latency buckets (low->high),
 * cols = time buckets (old->new). Values are span counts.
 * `timeCentersMs` = bucket midpoints (length = cols) for charting.
 * `timeEdgesMs` = bucket boundaries (length = cols+1) for drill-down.
 */
export interface HeatmapMatrix {
  rows: number;
  cols: number;
  latencyEdgesMs: number[];
  timeCentersMs: number[];
  timeEdgesMs: number[];
  values: Float32Array;
}

/** Percentile latency over time (one value per time bucket). */
export interface PercentileSeries {
  timeCentersMs: number[];
  p50: Float32Array;
  p95: Float32Array;
  p99: Float32Array;
}

/** Throughput / error-rate over time. */
export interface ThroughputSeries {
  timeCentersMs: number[];
  spansPerSec: Float32Array;
  errorsPerSec: Float32Array;
}

/** A complete aggregated render frame for the current window+filters. */
export interface FrameData {
  type: "frame";
  windowStartMs: number;
  windowEndMs: number;
  heatmap: HeatmapMatrix;
  percentiles: PercentileSeries;
  throughput: ThroughputSeries;
}

/** Rolling worker-side stats for the debug/perf overlay. */
export interface WorkerStats {
  type: "stats";
  spansGeneratedTotal: number;
  spansPerSec: number;
  framesEmittedTotal: number;
  droppedSpans: number;
}

export type WorkerToMainMessage = FrameData | WorkerStats;
