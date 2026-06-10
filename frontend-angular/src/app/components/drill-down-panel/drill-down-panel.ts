// src/app/components/drill-down-panel/drill-down-panel.ts
// Displays raw trace spans from a clicked heatmap cell.

import { Component, input } from '@angular/core';

interface DrillDownSpan {
  ts: number;
  service: string;
  endpoint: string;
  latencyMs: number;
  status: number;
  traceId: string;
}

interface DrillDownResult {
  count: number;
  spans: DrillDownSpan[];
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3 as any,
  });
}

@Component({
  selector: 'app-drill-down-panel',
  standalone: true,
  template: `
    <div class="chart-panel" style="flex-shrink: 0; max-height: 200px;">
      <div class="chart-title">
        Trace Details {{ data() ? '(' + data()!.count + ' spans)' : '' }}
      </div>

      @if (!data() || data()!.spans.length === 0) {
        <div class="empty-state">
          {{ !data() ? 'Click a heatmap cell to inspect traces' : 'No spans in this bucket' }}
        </div>
      } @else {
        <div class="drill-table-wrapper">
          <table class="drill-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Service</th>
                <th>Endpoint</th>
                <th>Latency</th>
                <th>Status</th>
                <th>Trace ID</th>
              </tr>
            </thead>
            <tbody>
              @for (sp of data()!.spans; track sp.traceId + sp.ts) {
                <tr [class.row-error]="sp.status >= 500" [class.row-warn]="sp.status >= 400 && sp.status < 500">
                  <td>{{ fmtTime(sp.ts) }}</td>
                  <td>{{ sp.service }}</td>
                  <td>{{ sp.endpoint }}</td>
                  <td class="num">{{ sp.latencyMs.toFixed(1) }}ms</td>
                  <td>
                    <span class="badge" [class.badge-error]="sp.status >= 500" [class.badge-ok]="sp.status < 400">
                      {{ sp.status }}
                    </span>
                  </td>
                  <td class="mono">{{ sp.traceId }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .chart-panel {
      background: var(--bg-panel, #0d0d20);
      border: 1px solid var(--border, rgba(255,255,255,0.07));
      border-radius: 6px; padding: 8px;
      display: flex; flex-direction: column; min-width: 0; overflow: hidden;
    }
    .chart-title {
      font-size: 10px; font-weight: 500; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--text-dim, #475569);
      margin-bottom: 6px; flex-shrink: 0;
    }
    .drill-table-wrapper { overflow-y: auto; flex: 1; }
    .drill-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
    .drill-table th:nth-child(1) { width: 18%; }
    .drill-table th:nth-child(2) { width: 16%; }
    .drill-table th:nth-child(3) { width: 28%; }
    .drill-table th:nth-child(4) { width: 10%; }
    .drill-table th:nth-child(5) { width: 8%; }
    .drill-table th:nth-child(6) { width: 20%; }
    .drill-table th {
      text-align: left; padding: 4px 8px;
      color: var(--text-dim, #475569); font-size: 10px;
      letter-spacing: 0.06em; text-transform: uppercase; font-weight: 500;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.07));
      position: sticky; top: 0;
      background: var(--bg-primary, #0a0a1a); z-index: 1;
    }
    .drill-table td {
      padding: 2px 8px;
      border-bottom: rgba(255,255,255,0.03);
      white-space: nowrap; color: var(--text-secondary, #94a3b8);
    }
    .drill-table td.num { text-align: right; }
    .drill-table tr.row-error { background: rgba(239,68,68,0.06); }
    .drill-table tr.row-warn { background: rgba(234,179,8,0.06); }
    .drill-table tr:hover { background: rgba(255,255,255,0.02); }
    .mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; color: var(--text-muted, #64748b); }
    .badge {
      display: inline-block; padding: 1px 7px; border-radius: 3px;
      font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
      border: 1px solid transparent;
    }
    .badge-ok {
      background: rgba(34,197,94,0.12); color: var(--green, #22c55e);
      border-color: rgba(34,197,94,0.25);
    }
    .badge-error {
      background: rgba(239,68,68,0.12); color: var(--red, #ef4444);
      border-color: rgba(239,68,68,0.25);
    }
    .empty-state {
      display: flex; align-items: center; justify-content: center;
      flex: 1; color: var(--text-muted, #64748b);
      font-size: 12px; height: 100%; min-height: 80px;
    }
  `],
})
export class DrillDownPanel {
  readonly data = input<DrillDownResult | null>(null);
  readonly fmtTime = fmtTime;
}
