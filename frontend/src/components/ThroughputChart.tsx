// frontend/src/components/ThroughputChart.tsx
// uPlot chart showing spans/sec and errors/sec over time.

import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ThroughputSeries } from "../worker/types";
import { useThornStore } from "../store/useThornStore";

interface Props {
  data: ThroughputSeries | null;
}

export function ThroughputChart({ data }: Props) {
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
      height: 150,
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
          label: "req/s",
          size: 60,
          font: "10px JetBrains Mono, monospace",
          labelFont: "10px Inter, system-ui",
        },
      ],
      series: [
        { label: "Time" },
        {
          label: "Requests/s",
          stroke: "#3b82f6",
          width: 1.5,
          fill: "rgba(59,130,246,0.05)",
        },
        {
          label: "Errors/s",
          stroke: "#ef4444",
          width: 1.5,
        },
      ],
      hooks: {
        setSelect: [
          (u) => {
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

    const empty: uPlot.AlignedData = [[0], [0], [0]];
    chartRef.current = new uPlot(opts, empty, containerRef.current);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [setWindow, setFollow]);

  // Update data on new frame
  useEffect(() => {
    if (!chartRef.current || !data) return;

    const timeData = new Float64Array(data.timeCentersMs.map((t) => t / 1000));
    chartRef.current.setData(
      [timeData, new Float64Array(data.spansPerSec), new Float64Array(data.errorsPerSec)],
      false
    );
  }, [data]);

  // Sync x-scale to window
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setScale("x", {
      min: win.startMs / 1000,
      max: win.endMs / 1000,
    });
  }, [win.startMs, win.endMs]);

  return (
    <div className="chart-panel">
      <div className="chart-title">Throughput</div>
      <div ref={containerRef} />
    </div>
  );
}
