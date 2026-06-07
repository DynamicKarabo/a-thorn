// frontend/src/store/useThornStore.ts
// Zustand store — single source of truth for A Thorn.

import { create } from "zustand";
import type {
  FilterState,
  WindowRange,
  FrameData,
  WorkerStats,
  DrillDownResult,
} from "../worker/types";

interface ThornState {
  worker: Worker | null;
  connected: boolean;
  frame: FrameData | null;
  stats: WorkerStats | null;
  window: WindowRange;
  filters: FilterState;
  paused: boolean;
  emitRate: number;

  // Drill-down
  drillDown: DrillDownResult | null;
  drillDownQueryId: number;

  initWorker: () => void;
  destroyWorker: () => void;
  setWindow: (range: WindowRange) => void;
  setFollow: (follow: boolean) => void;
  setFilters: (f: FilterState) => void;
  togglePause: () => void;
  setEmitRate: (rate: number) => void;
  injectAnomaly: (kind: "spike" | "error_burst") => void;
  queryCell: (timeIdx: number, latencyIdx: number) => void;
}

let queryIdCounter = 0;

export const useThornStore = create<ThornState>((set, get) => ({
  worker: null,
  connected: false,
  frame: null,
  stats: null,
  window: {
    startMs: Date.now() - 30_000,
    endMs: Date.now(),
    follow: true,
  },
  filters: {
    services: [],
    endpoints: [],
    statusClasses: [],
  },
  paused: false,
  emitRate: 200,
  drillDown: null,
  drillDownQueryId: 0,

  initWorker: () => {
    const existing = get().worker;
    if (existing) existing.terminate();

    const w = new Worker(new URL("../worker/index.ts", import.meta.url), {
      type: "module",
    });

    w.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === "frame") {
        set({ frame: msg, connected: true });
      } else if (msg.type === "stats") {
        set({ stats: msg });
      } else if (msg.type === "cell_result") {
        // Only accept if queryId still matches (discard stale responses)
        const current = get().drillDownQueryId;
        if (msg.queryId >= current) {
          set({ drillDown: msg });
        }
      }
    };

    w.onerror = (err) => console.error("A Thorn worker error:", err);
    set({ worker: w, connected: true });
  },

  destroyWorker: () => {
    get().worker?.terminate();
    set({ worker: null, connected: false, frame: null, drillDown: null });
  },

  setWindow: (range) => {
    get().worker?.postMessage({ type: "set_window", range });
    set({ window: range });
  },

  setFollow: (follow) => {
    const w = get().window;
    const now = Date.now();
    if (follow) {
      const newRange = { startMs: now - 30_000, endMs: now, follow: true };
      get().worker?.postMessage({ type: "set_window", range: newRange });
      set({ window: newRange });
    } else {
      set({ window: { ...w, follow: false } });
    }
  },

  setFilters: (filters) => {
    get().worker?.postMessage({ type: "set_filters", filters });
    set({ filters });
  },

  togglePause: () => {
    const paused = !get().paused;
    get().worker?.postMessage({ type: paused ? "pause" : "resume" });
    set({ paused });
  },

  setEmitRate: (emitRate) => {
    get().worker?.postMessage({ type: "set_rate", spansPerSec: emitRate });
    set({ emitRate });
  },

  injectAnomaly: (kind) => {
    get().worker?.postMessage({ type: "inject_anomaly", kind });
  },

  queryCell: (timeIdx, latencyIdx) => {
    const qid = ++queryIdCounter;
    const { heatmap } = get().frame ?? {};
    if (!heatmap) return;

    // Use bucket edges (not centers) so drill-down matches heatmap aggregation exactly.
    const tLo = heatmap.timeEdgesMs[timeIdx];
    const tHi = heatmap.timeEdgesMs[Math.min(timeIdx + 1, heatmap.timeEdgesMs.length - 1)];
    const latLo = heatmap.latencyEdgesMs[latencyIdx];
    const latHi = heatmap.latencyEdgesMs[Math.min(latencyIdx + 1, heatmap.latencyEdgesMs.length - 1)];

    if (tLo === undefined || tHi === undefined) return;

    set({ drillDownQueryId: qid });
    get().worker?.postMessage({
      type: "query_cell",
      queryId: qid,
      timeRange: [tLo, tHi],
      latencyRange: [latLo, latHi ?? Infinity],
    });
  },
}));
