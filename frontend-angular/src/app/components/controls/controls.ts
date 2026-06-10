// src/app/components/controls/controls.ts
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-controls',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="controls-bar">
      <div class="controls-group">
        <button class="ctrl-btn" (click)="togglePause.emit()">
          {{ paused() ? '▶ Resume' : '⏸ Pause' }}
        </button>
      </div>

      <div class="controls-group">
        <span class="ctrl-label">Rate:</span>
        <select class="ctrl-select" [ngModel]="emitRate()" (ngModelChange)="setRate.emit($event)">
          <option [value]="50">50/s</option>
          <option [value]="100">100/s</option>
          <option [value]="200">200/s</option>
          <option [value]="500">500/s</option>
          <option [value]="1000">1000/s</option>
        </select>
      </div>

      <div class="controls-group" style="margin-left: auto;">
        <button class="ctrl-btn warn" (click)="spike.emit()">⚡ Latency Spike</button>
        <button class="ctrl-btn danger" (click)="errorBurst.emit()">💥 Error Burst</button>
        <button class="ctrl-btn" (click)="resetWindow.emit()">↺ Reset View</button>
      </div>
    </div>
  `,
  styles: [`
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
    .ctrl-label {
      font-size: 11px; color: var(--text-muted, #64748b);
      display: flex; align-items: center; gap: 4px;
    }
    .ctrl-select {
      padding: 3px 6px; font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
      background: var(--bg-secondary, #0d0d20); color: var(--text-primary, #e2e8f0);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px; cursor: pointer;
    }
  `],
})
export class Controls {
  readonly paused = () => false;
  readonly emitRate = () => 200;
  readonly togglePause = output();
  readonly setRate = output<number>();
  readonly spike = output();
  readonly errorBurst = output();
  readonly resetWindow = output();
}
