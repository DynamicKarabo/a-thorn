// src/app/services/worker.service.ts
// Angular service wrapping the Web Worker lifecycle.
// Worker messages flow into signals. No RxJS — signals are the right primitive
// for discrete push events landing in component-bound state.

import { Injectable, NgZone, signal, DestroyRef, inject } from '@angular/core';
import type {
  FrameData, WorkerStats, DrillDownResult, DrillDownSpan,
  WindowRange, FilterState, MainToWorkerMessage, WorkerToMainMessage,
} from '../worker/types';

export interface WorkerState {
  connected: boolean;
  frame: FrameData | null;
  stats: WorkerStats | null;
  drillDown: DrillDownResult | null;
}

const WINDOW_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class WorkerService {
  private worker: Worker | null = null;
  private queryIdCounter = 0;
  private currentQueryId = 0;

  readonly connected = signal(false);
  readonly frame = signal<FrameData | null>(null);
  readonly stats = signal<WorkerStats | null>(null);
  readonly drillDown = signal<DrillDownResult | null>(null);
  readonly paused = signal(false);
  readonly emitRate = signal(200);

  private windowRange: WindowRange = { startMs: 0, endMs: 0, follow: true };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  init(): void {
    this.destroy();
    this.resetWindow();

    const w = new Worker(new URL('../worker/index.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (ev: MessageEvent<WorkerToMainMessage>) => {
      const msg = ev.data;
      switch (msg.type) {
        case 'frame':
          // Signal writes schedule CD without zone.run()
          this.frame.set(msg);
          if (!this.connected()) this.connected.set(true);
          break;
        case 'stats':
          this.stats.set(msg);
          break;
        case 'cell_result':
          // Accept only the most recent query
          if (msg.queryId === this.currentQueryId) {
            this.drillDown.set(msg);
          }
          break;
      }
    };

    w.onerror = () => {
      console.error('Worker error — terminating');
      this.worker?.terminate();
      this.worker = null;
      this.connected.set(false);
    };

    this.worker = w;
    this.connected.set(true);
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.connected.set(false);
    this.frame.set(null);
    this.drillDown.set(null);
  }

  private post(msg: MainToWorkerMessage): void {
    this.worker?.postMessage(msg);
  }

  setWindow(range: WindowRange): void {
    this.windowRange = range;
    this.post({ type: 'set_window', range });
  }

  togglePause(): void {
    const next = !this.paused();
    this.paused.set(next);
    this.post({ type: next ? 'pause' : 'resume' });
  }

  setEmitRate(rate: number): void {
    this.emitRate.set(rate);
    this.post({ type: 'set_rate', spansPerSec: rate });
  }

  injectAnomaly(kind: 'spike' | 'error_burst'): void {
    this.post({ type: 'inject_anomaly', kind });
  }

  queryCell(timeIdx: number, latencyIdx: number): void {
    const heatmap = this.frame()?.heatmap;
    if (!heatmap) return;

    const qid = ++this.queryIdCounter;
    this.currentQueryId = qid;

    const tLo = heatmap.timeEdgesMs[timeIdx];
    const tHi = heatmap.timeEdgesMs[Math.min(timeIdx + 1, heatmap.timeEdgesMs.length - 1)];
    const latLo = heatmap.latencyEdgesMs[latencyIdx];
    const latHi = heatmap.latencyEdgesMs[Math.min(latencyIdx + 1, heatmap.latencyEdgesMs.length - 1)];

    if (tLo == null || tHi == null || latLo == null) return;

    this.post({
      type: 'query_cell',
      queryId: qid,
      timeRange: [tLo, tHi],
      latencyRange: [latLo, latHi ?? Infinity],
    });
  }

  resetWindow(): void {
    const now = Date.now();
    this.windowRange = { startMs: now - WINDOW_MS, endMs: now, follow: true };
    this.post({ type: 'set_window', range: this.windowRange });
  }
}
