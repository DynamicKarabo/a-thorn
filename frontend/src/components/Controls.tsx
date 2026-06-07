// frontend/src/components/Controls.tsx

interface Props {
  paused: boolean;
  emitRate: number;
  onTogglePause: () => void;
  onSetRate: (rate: number) => void;
  onInjectSpike: () => void;
  onInjectErrorBurst: () => void;
  onResetWindow: () => void;
}

export function Controls({
  paused,
  emitRate,
  onTogglePause,
  onSetRate,
  onInjectSpike,
  onInjectErrorBurst,
  onResetWindow,
}: Props) {
  return (
    <div className="controls-bar">
      <div className="controls-group">
        <button onClick={onTogglePause} className="ctrl-btn">
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button onClick={onResetWindow} className="ctrl-btn" title="Reset to live following window">
          ⟲ Live
        </button>
      </div>

      <div className="controls-group">
        <label className="ctrl-label">
          Rate:
          <select
            value={emitRate}
            onChange={(e) => onSetRate(Number(e.target.value))}
            className="ctrl-select"
          >
            <option value={50}>50/s</option>
            <option value={100}>100/s</option>
            <option value={200}>200/s</option>
            <option value={500}>500/s</option>
            <option value={1000}>1000/s</option>
          </select>
        </label>
      </div>

      <div className="controls-group">
        <button onClick={onInjectSpike} className="ctrl-btn warn">
          ⚡ Latency Spike
        </button>
        <button onClick={onInjectErrorBurst} className="ctrl-btn danger">
          💥 Error Burst
        </button>
      </div>
    </div>
  );
}
