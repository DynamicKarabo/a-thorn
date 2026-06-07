// frontend/src/components/StatusBar.tsx
import type { WorkerStats } from "../worker/types";

interface Props {
  stats: WorkerStats | null;
  connected: boolean;
  paused: boolean;
  emitRate: number;
}

export function StatusBar({ stats, connected, paused, emitRate }: Props) {
  return (
    <div className="status-bar">
      <span className={`status-dot ${connected ? "connected" : ""}`} />
      <span>{connected ? "Worker Active" : "Offline"}</span>
      {stats && (
        <>
          <span className="sep">|</span>
          <span>Spans: {stats.spansGeneratedTotal.toLocaleString()}</span>
        </>
      )}
      <span className="sep">|</span>
      <span>Emit: {emitRate}/s</span>
      {paused && (
        <>
          <span className="sep">|</span>
          <span style={{ color: "#eab308" }}>⏸ PAUSED</span>
        </>
      )}
    </div>
  );
}
