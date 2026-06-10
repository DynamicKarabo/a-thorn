// src/app/components/percentile-chart/percentile-chart.ts
// uPlot percentile chart — p50 / p95 / p99 latency over time.
// Runs outside Angular's zone for performance; only state sync re-enters via signals.

import { Component, ElementRef, effect, input, viewChild, afterNextRender, NgZone, DestroyRef, inject, output } from '@angular/core';
import uPlot from 'uplot';

@Component({
  selector: 'app-percentile-chart',
  standalone: true,
  template: `<div class="chart-panel">
    <div class="chart-title">Latency Percentiles</div>
    <div #container></div>
  </div>`,
  styles: [`
    .chart-panel {
      background: var(--bg-panel, #0d0d20);
      border: 1px solid var(--border, rgba(255,255,255,0.07));
      border-radius: 6px; padding: 8px;
      display: flex; flex-direction: column;
      flex: 1; min-width: 0; overflow: hidden;
    }
    .chart-title {
      font-size: 10px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--text-dim, #475569);
      margin-bottom: 6px; flex-shrink: 0;
    }
  `],
})
export class PercentileChart {
  readonly container = viewChild<ElementRef<HTMLDivElement>>('container');
  private chart: uPlot | null = null;

  readonly data = input<{
    timeCentersMs: number[];
    p50: Float32Array;
    p95: Float32Array;
    p99: Float32Array;
  } | null>(null);

  readonly windowStartMs = input(0);
  readonly windowEndMs = input(0);

  readonly brush = output<{ startMs: number; endMs: number }>();

  constructor() {
    const ngZone = inject(NgZone);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const el = this.container()?.nativeElement;
      if (!el) return;

      const opts: uPlot.Options = {
        width: el.clientWidth,
        height: 200,
        cursor: {
          drag: { x: true, y: false, setScale: false },
          sync: { key: 'thorn', setSeries: true },
          x: true, y: true,
          points: { size: 6, width: 2 },
        },
        select: { show: true, left: 0, top: 0, width: 0, height: 0 },
        axes: [
          {
            stroke: 'rgba(255,255,255,0.12)',
            grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
            ticks: { stroke: 'rgba(255,255,255,0.06)', width: 1 },
            font: '10px JetBrains Mono, monospace',
            values: (_, splits) =>
              splits.map((s) => {
                const d = new Date(s * 1000);
                return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              }),
          },
          {
            stroke: 'rgba(255,255,255,0.12)',
            grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
            label: 'Latency (ms)',
            size: 60,
            font: '10px JetBrains Mono, monospace',
            labelFont: '10px Inter, system-ui',
          },
        ],
        series: [
          { label: 'Time' },
          { label: 'p50', stroke: '#22c55e', width: 1.5, fill: 'rgba(34,197,94,0.05)' },
          { label: 'p95', stroke: '#eab308', width: 1.5 },
          { label: 'p99', stroke: '#ef4444', width: 1.5 },
        ],
        hooks: {
          setSelect: [
            (u) => {
              if (!u.cursor.event) return;
              if (u.select.width <= 0 || u.select.height <= 0) return;
              const leftIdx = u.posToIdx(u.select.left);
              const rightIdx = u.posToIdx(u.select.left + u.select.width);
              const t0 = u.data[0][leftIdx];
              const t1 = u.data[0][rightIdx];
              if (t0 != null && t1 != null && t1 > t0) {
                this.brush.emit({ startMs: Math.round(t0 * 1000), endMs: Math.round(t1 * 1000) });
              }
            },
          ],
        },
      };

      const empty: uPlot.AlignedData = [[0], [0], [0], [0]];
      this.chart = new uPlot(opts, empty, el);

      destroyRef.onDestroy(() => {
        this.chart?.destroy();
        this.chart = null;
      });
    });

    // Effect: update data on new frame — runs outside zone via uPlot.setData
    effect(() => {
      const d = this.data();
      const chart = this.chart;
      if (!chart || !d) return;
      ngZone.runOutsideAngular(() => {
        chart.setData([
          new Float64Array(d.timeCentersMs.map((t) => t / 1000)),
          new Float64Array(d.p50),
          new Float64Array(d.p95),
          new Float64Array(d.p99),
        ], false);
      });
    });

    // Effect: sync x-scale to window
    effect(() => {
      const chart = this.chart;
      if (!chart) return;
      ngZone.runOutsideAngular(() => {
        chart.setScale('x', { min: this.windowStartMs() / 1000, max: this.windowEndMs() / 1000 });
      });
    });
  }
}
