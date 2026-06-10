// src/app/components/latency-heatmap/latency-heatmap.ts
// Canvas-based latency heatmap. Rows = latency buckets, cols = time buckets.

import {
  Component, ElementRef, effect, input, viewChild,
  afterNextRender, NgZone, DestroyRef, inject, output, Injector,
} from '@angular/core';

interface HeatmapData {
  rows: number; cols: number;
  latencyEdgesMs: number[]; timeEdgesMs: number[];
  values: Float32Array;
  maxValue?: number; // optional, avoids scan
}

@Component({
  selector: 'app-latency-heatmap',
  standalone: true,
  template: `<div class="chart-panel" style="flex: 1;">
    <div class="chart-title">Latency Heatmap</div>
    <canvas #canvas
      (click)="onCanvasClick($event)"
      style="width: 100%; height: calc(100% - 28px); cursor: pointer;">
    </canvas>
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
export class LatencyHeatmap {
  readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  readonly data = input<HeatmapData | null>(null);
  readonly cellClick = output<{ timeIdx: number; latencyIdx: number }>();

  private drawFn = () => {};

  constructor() {
    const ngZone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    const injector = inject(Injector);

    afterNextRender(() => {
      this.drawFn = () => {
        const canvasEl = this.canvas()?.nativeElement;
        if (!canvasEl || !this.data()) return;

        const ctx = canvasEl.getContext('2d');
        if (!ctx) return;

        const { rows, cols, values, latencyEdgesMs, maxValue } = this.data()!;
        const dpr = window.devicePixelRatio || 1;
        const w = canvasEl.clientWidth * dpr;
        const h = canvasEl.clientHeight * dpr;
        if (canvasEl.width !== w || canvasEl.height !== h) {
          canvasEl.width = w;
          canvasEl.height = h;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const cellW = canvasEl.clientWidth / cols;
        const cellH = canvasEl.clientHeight / rows;

        // Use optional maxValue from worker to avoid O(rows*cols) scan
        const maxVal = maxValue ?? (() => {
          let m = 0;
          for (let i = 0; i < values.length; i++) if (values[i] > m) m = values[i];
          return m;
        })();
        const norm = maxVal || 1;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const v = values[r * cols + c] / norm;
            if (v < 0.001) continue;

            let color: string;
            if (v < 0.1) color = `rgba(30,58,138,${0.3 + v * 3})`;
            else if (v < 0.3) color = `rgba(29,78,216,${0.5 + v})`;
            else if (v < 0.5) color = `rgba(59,130,246,${0.7 + v * 0.3})`;
            else if (v < 0.7) color = `rgba(234,179,8,${0.7 + v * 0.3})`;
            else if (v < 0.85) color = `rgba(249,115,22,${0.8 + v * 0.2})`;
            else color = `rgba(239,68,68,${0.9 + v * 0.1})`;

            ctx.fillStyle = color;
            ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
          }
        }

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let r = 0; r <= rows; r++) {
          ctx.beginPath(); ctx.moveTo(0, r * cellH); ctx.lineTo(canvasEl.clientWidth, r * cellH); ctx.stroke();
        }
        for (let c = 0; c <= cols; c++) {
          ctx.beginPath(); ctx.moveTo(c * cellW, 0); ctx.lineTo(c * cellW, canvasEl.clientHeight); ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        if (latencyEdgesMs) {
          for (let r = 0; r < rows; r += Math.max(1, Math.floor(rows / 6))) {
            ctx.fillText(`${Math.round(latencyEdgesMs[r])}ms`, 4, (r + 0.5) * cellH + 3);
          }
        }
      };

      // Resize listener (captured in constructor context, not callback)
      const onResize = () => ngZone.runOutsideAngular(() => this.drawFn());
      window.addEventListener('resize', onResize);
      destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    });

    // Effect in constructor injection context with explicit injector
    effect(() => {
      this.data(); // track
      ngZone.runOutsideAngular(() => this.drawFn());
    }, { injector });
  }

  onCanvasClick(event: MouseEvent): void {
    const d = this.data();
    const el = this.canvas()?.nativeElement;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const col = Math.min(d.cols - 1, Math.floor((event.clientX - rect.left) / (rect.width / d.cols)));
    const row = Math.min(d.rows - 1, Math.floor((event.clientY - rect.top) / (rect.height / d.rows)));
    this.cellClick.emit({ timeIdx: col, latencyIdx: row });
  }
}
