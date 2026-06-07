// frontend/src/App.tsx
import { useEffect } from "react";
import { useThornStore } from "./store/useThornStore";
import { StatusBar } from "./components/StatusBar";
import { Controls } from "./components/Controls";
import { PercentileChart } from "./components/PercentileChart";
import { ThroughputChart } from "./components/ThroughputChart";
import { LatencyHeatmap } from "./components/LatencyHeatmap";
import { DrillDownPanel } from "./components/DrillDownPanel";
import "./App.css";

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
    <div className="app">
      <header className="app-header">
        <h1>A THORN</h1>
        <span className="app-subtitle">Real-Time Observability Dashboard</span>
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

      <main className="dashboard">
        <div className="chart-row">
          <PercentileChart data={frame?.percentiles ?? null} />
          <ThroughputChart data={frame?.throughput ?? null} />
        </div>
        <div className="chart-row grow">
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
