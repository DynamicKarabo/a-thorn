// frontend/src/components/PercentileChart.tsx
// uPlot chart showing p50 / p95 / p99 latency over time.

import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PercentileSeries } from "../worker/types";
import { useThornStore } from "../store/useThornStore";

interface Props {
  data: PercentileSeries | null;
}

export function PercentileChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const setWindow = useThornStore((s) => s.setWindow);
  const setFollow = useThornStore((s) => s.setFollow);
  const win = useThornStore((s) => s.window);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 200,
      cursor: {
        drag: { x: true, y: false, setScale: false },
        sync: { key: "thorn", setSeries: true },
        x: true,
        y: true,
        points: { size: 6, width: 2 },
      },
      select: { show: true, left: 0, top: 0, width: 0, height: 0 },
      axes: [
        {
          stroke: "rgba(255,255,255,0.12)",
          grid: { stroke: "rgba(255,255,255,0.04)", width: 1 },
          ticks: { stroke: "rgba(255,255,255,0.06)", width: 1 },
          font: "10px JetBrains Mono, monospace",
          values: (_, splits) =>
            splits.map((s) => {
              const d = new Date(s * 1000);
              return d.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
            }),
        },
        {
          stroke: "rgba(255,255,255,0.12)",
          grid: { stroke: "rgba(255,255,255,0.04)", width: 1 },
          label: "Latency (ms)",
          size: 60,
          font: "10px JetBrains Mono, monospace",
          labelFont: "10px Inter, system-ui",
        },
      ],
      series: [
        { label: "Time" },
        {
          label: "p50",
          stroke: "#22c55e",
          width: 1.5,
          fill: "rgba(34,197,94,0.05)",
        },
        {
          label: "p95",
          stroke: "#eab308",
          width: 1.5,
        },
        {
          label: "p99",
          stroke: "#ef4444",
          width: 1.5,
        },
      ],
      hooks: {
        setSelect: [
          (u) => {
            // Ignore programmatic selects (e.g. from setScale) to avoid feedback loop.
            if (!u.cursor.event) return;
            if (u.select.width <= 0 || u.select.height <= 0) return;
            const leftIdx = u.posToIdx(u.select.left);
            const rightIdx = u.posToIdx(u.select.left + u.select.width);
            const t0 = u.data[0][leftIdx];
            const t1 = u.data[0][rightIdx];
            if (t0 != null && t1 != null && t1 > t0) {
              setWindow({
                startMs: Math.round(t0 * 1000),
                endMs: Math.round(t1 * 1000),
                follow: false,
              });
              setFollow(false);
            }
          },
        ],
      },
    };

    const empty: uPlot.AlignedData = [[0], [0], [0], [0]];
    chartRef.current = new uPlot(opts, empty, containerRef.current);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [setWindow, setFollow]);

  // Update data on new frame — no scale change
  useEffect(() => {
    if (!chartRef.current || !data) return;

    const timeData = new Float64Array(data.timeCentersMs.map((t) => t / 1000));
    chartRef.current.setData(
      [timeData, new Float64Array(data.p50), new Float64Array(data.p95), new Float64Array(data.p99)],
      false // don't reset scales — scale is controlled by the window effect
    );
  }, [data]);

  // Sync x-scale to window — only runs when window actually changes
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setScale("x", {
      min: win.startMs / 1000,
      max: win.endMs / 1000,
    });
  }, [win.startMs, win.endMs]);

  return (
    <div className="chart-panel">
      <div className="chart-title">Latency Percentiles</div>
      <div ref={containerRef} />
    </div>
  );
}
