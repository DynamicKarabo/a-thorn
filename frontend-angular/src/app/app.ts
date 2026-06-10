// src/app/app.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WorkerService } from './services/worker.service';
import { StatusBar } from './components/status-bar/status-bar';
import { PercentileChart } from './components/percentile-chart/percentile-chart';
import { ThroughputChart } from './components/throughput-chart/throughput-chart';
import { LatencyHeatmap } from './components/latency-heatmap/latency-heatmap';
import { DrillDownPanel } from './components/drill-down-panel/drill-down-panel';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    StatusBar,
    PercentileChart,
    ThroughputChart,
    LatencyHeatmap,
    DrillDownPanel,
  ],
  template: `
    <div class="app">
      <header class="app-header">
        <h1>A THORN</h1>
        <span class="app-subtitle">Real-Time Observability Dashboard</span>
      </header>

      <app-status-bar
        [connected]="worker.connected()"
        [paused]="worker.paused()"
        [emitRate]="worker.emitRate()"
        [stats]="worker.stats()"
      />

      <div class="controls-bar">
        <button class="ctrl-btn" (click)="worker.togglePause()">
          {{ worker.paused() ? '▶ Resume' : '⏸ Pause' }}
        </button>

        <div class="controls-group">
          <span class="ctrl-label">Rate:</span>
          <select class="ctrl-select" [value]="worker.emitRate()" (change)="onRateChange($event)">
            <option value="50">50/s</option>
            <option value="100">100/s</option>
            <option value="200">200/s</option>
            <option value="500">500/s</option>
            <option value="1000">1000/s</option>
          </select>
        </div>

        <div class="controls-group" style="margin-left: auto;">
          <button class="ctrl-btn warn" (click)="worker.injectAnomaly('spike')">⚡ Latency Spike</button>
          <button class="ctrl-btn danger" (click)="worker.injectAnomaly('error_burst')">💥 Error Burst</button>
          <button class="ctrl-btn" (click)="worker.resetWindow()">↺ Reset View</button>
        </div>
      </div>

      <main class="dashboard">
        <div class="chart-row">
          <app-percentile-chart
            [data]="worker.frame()?.percentiles ?? null"
            [windowStartMs]="worker.frame()?.windowStartMs ?? 0"
            [windowEndMs]="worker.frame()?.windowEndMs ?? 0"
            (brush)="onBrush($event)"
          />
          <app-throughput-chart
            [data]="worker.frame()?.throughput ?? null"
            [windowStartMs]="worker.frame()?.windowStartMs ?? 0"
            [windowEndMs]="worker.frame()?.windowEndMs ?? 0"
            (brush)="onBrush($event)"
          />
        </div>
        <div class="chart-row grow">
          <app-latency-heatmap
            [data]="worker.frame()?.heatmap ?? null"
            (cellClick)="onCellClick($event.timeIdx, $event.latencyIdx)"
          />
        </div>
        <app-drill-down-panel [data]="worker.drillDown()" />
      </main>
    </div>
  `,
  styles: [`
    .app { display: flex; flex-direction: column; height: 100vh; }
    .app-header {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 20px; background: var(--bg-secondary, #0d0d20);
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.07)); flex-shrink: 0;
    }
    .app-header h1 { font-size: 18px; font-weight: 700; letter-spacing: 3px; color: var(--accent, #3b82f6); }
    .app-subtitle { font-size: 11px; color: var(--text-muted, #64748b); text-transform: uppercase; letter-spacing: 1px; }
    .controls-bar {
      display: flex; align-items: center; gap: 16px; padding: 8px 20px;
      background: var(--bg-secondary, #0d0d20);
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.07));
      flex-shrink: 0; flex-wrap: wrap;
    }
    .controls-group { display: flex; align-items: center; gap: 6px; }
    .ctrl-btn {
      padding: 4px 12px; font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      background: var(--bg-secondary, #0d0d20); color: var(--text-secondary, #94a3b8);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px; cursor: pointer; transition: all 0.15s;
    }
    .ctrl-btn:hover {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.2);
      color: var(--text-primary, #e2e8f0);
    }
    .ctrl-btn.warn { border-color: rgba(234,179,8,0.3); color: var(--yellow, #eab308); }
    .ctrl-btn.warn:hover { background: rgba(234,179,8,0.1); border-color: rgba(234,179,8,0.5); }
    .ctrl-btn.danger { border-color: rgba(239,68,68,0.3); color: var(--red, #ef4444); }
    .ctrl-btn.danger:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.5); }
    .ctrl-label { font-size: 11px; color: var(--text-muted, #64748b); display: flex; align-items: center; gap: 4px; }
    .ctrl-select {
      padding: 3px 6px; font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      background: var(--bg-secondary, #0d0d20); color: var(--text-primary, #e2e8f0);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; cursor: pointer;
    }
    .dashboard { flex: 1; display: flex; flex-direction: column; padding: 8px; gap: 8px; overflow: hidden; }
    .chart-row { display: flex; gap: 8px; flex-shrink: 0; }
    .chart-row.grow { flex: 1; min-height: 0; }
  `],
})
export class App implements OnInit, OnDestroy {
  readonly worker = inject(WorkerService);

  ngOnInit(): void {
    this.worker.init();
  }

  ngOnDestroy(): void {
    this.worker.destroy();
  }

  onBrush(range: { startMs: number; endMs: number }): void {
    this.worker.setWindow({ ...range, follow: false });
  }

  onCellClick(timeIdx: number, latencyIdx: number): void {
    this.worker.queryCell(timeIdx, latencyIdx);
  }

  onRateChange(event: Event): void {
    const value = parseInt((event.target as HTMLSelectElement).value, 10);
    this.worker.setEmitRate(value);
  }
}
