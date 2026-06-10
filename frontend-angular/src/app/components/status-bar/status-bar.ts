// src/app/components/status-bar/status-bar.ts
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  template: `
    <div class="status-bar">
      <span class="status-dot" [class.connected]="connected()"></span>
      <span>{{ connected() ? 'Worker Active' : 'Offline' }}</span>
      <span class="sep">|</span>
      <span>Spans: {{ stats()?.spansGeneratedTotal?.toLocaleString() ?? 0 }}</span>
      <span class="sep">|</span>
      <span>Emit: {{ emitRate() }}/s</span>
      @if (paused()) {
        <span class="sep">|</span>
        <span style="color: #eab308">⏸ PAUSED</span>
      }
    </div>
  `,
  styles: [`
    .status-bar {
      display: flex; align-items: center; gap: 10px; padding: 6px 20px;
      font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: var(--text-muted, #64748b); background: var(--bg-muted, #0f0f24);
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.07)); flex-shrink: 0;
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim, #475569);
    }
    .status-dot.connected {
      background: var(--green, #22c55e);
      box-shadow: 0 0 6px rgba(34,197,94,0.5);
    }
    .sep { color: var(--border, rgba(255,255,255,0.07)); }
  `],
})
export class StatusBar {
  readonly connected = input(false);
  readonly paused = input(false);
  readonly emitRate = input(0);
  readonly stats = input<{ spansGeneratedTotal: number } | null>(null);
}
