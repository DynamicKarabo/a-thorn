// frontend/src/components/DrillDownPanel.tsx
// Displays raw trace spans from a clicked heatmap cell.

import type { DrillDownResult } from "../worker/types";

interface Props {
  data: DrillDownResult | null;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function DrillDownPanel({ data }: Props) {
  if (!data || data.spans.length === 0) {
    return (
      <div className="chart-panel" style={{ flexShrink: 0, maxHeight: 200 }}>
        <div className="chart-title">Trace Details</div>
        <div className="empty-state">
          {!data
            ? "Click a heatmap cell to inspect traces"
            : "No spans in this bucket"}
        </div>
      </div>
    );
  }

  return (
    <div className="chart-panel" style={{ flexShrink: 0, maxHeight: 200 }}>
      <div className="chart-title">
        Trace Details ({data.count} spans)
      </div>
      <div className="drill-table-wrapper">
        <table className="drill-table">
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
            {data.spans.map((sp) => (
              <tr key={sp.traceId + sp.ts} className={sp.status >= 500 ? "row-error" : sp.status >= 400 ? "row-warn" : ""}>
                <td>{fmtTime(sp.ts)}</td>
                <td>{sp.service}</td>
                <td>{sp.endpoint}</td>
                <td className="num">{sp.latencyMs.toFixed(1)}ms</td>
                <td>
                  <span className={`badge ${sp.status >= 500 ? "badge-error" : "badge-ok"}`}>
                    {sp.status}
                  </span>
                </td>
                <td className="mono">{sp.traceId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
