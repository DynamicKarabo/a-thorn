// frontend/src/App.tsx
import { useEffect } from "react";
import { useThornStore } from "./store/useThornStore";
import { StatusBar } from "./components/StatusBar";
import { Controls } from "./components/Controls";
import { PercentileChart } from "./components/PercentileChart";
import { ThroughputChart } from "./components/ThroughputChart";
import { LatencyHeatmap } from "./components/LatencyHeatmap";
import { DrillDownPanel } from "./components/DrillDownPanel";

export default function App() {
  const {
    frame,
    stats,
    connected,
    paused,
    emitRate,
    drillDown,
    initWorker,
    destroyWorker,
    togglePause,
    setEmitRate,
    injectAnomaly,
    setWindow,
    queryCell,
  } = useThornStore();

  useEffect(() => {
    initWorker();
    return () => destroyWorker();
  }, [initWorker, destroyWorker]);

  const resetWindow = () => {
    const now = Date.now();
    setWindow({ startMs: now - 30_000, endMs: now, follow: true });
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-bg-secondary border-b border-border shrink-0">
        <h1 className="text-lg font-bold tracking-[3px] text-accent">A THORN</h1>
        <span className="text-[11px] uppercase tracking-[1px] text-text-muted">Real-Time Observability Dashboard</span>
      </header>

      <StatusBar stats={stats} connected={connected} paused={paused} emitRate={emitRate} />

      <Controls
        paused={paused}
        emitRate={emitRate}
        onTogglePause={togglePause}
        onSetRate={setEmitRate}
        onInjectSpike={() => injectAnomaly("spike")}
        onInjectErrorBurst={() => injectAnomaly("error_burst")}
        onResetWindow={resetWindow}
      />

      <main className="flex-1 flex flex-col p-2 gap-2 overflow-hidden">
        <div className="flex gap-2 shrink-0">
          <PercentileChart data={frame?.percentiles ?? null} />
          <ThroughputChart data={frame?.throughput ?? null} />
        </div>
        <div className="flex gap-2 flex-1 min-h-0">
          <LatencyHeatmap
            data={frame?.heatmap ?? null}
            onCellClick={(t, l) => queryCell(t, l)}
          />
        </div>
        <DrillDownPanel data={drillDown} />
      </main>
    </div>
  );
}
