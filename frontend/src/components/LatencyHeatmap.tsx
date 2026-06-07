// frontend/src/components/LatencyHeatmap.tsx
// Canvas-based latency heatmap. Rows = latency buckets, cols = time buckets.
// Color intensity = span count in each cell. Click to drill down.

import { useEffect, useRef, useCallback } from "react";
import type { HeatmapMatrix } from "../worker/types";

interface Props {
  data: HeatmapMatrix | null;
  onCellClick?: (timeIdx: number, latencyIdx: number) => void;
}

export function LatencyHeatmap({ data, onCellClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rows, cols, values } = data;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    // Reset transform before applying DPR scale (prevents accumulation)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const cellW = canvas.clientWidth / cols;
    const cellH = canvas.clientHeight / rows;

    // Find max value for normalization
    let maxVal = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > maxVal) maxVal = values[i];
    }
    const norm = maxVal || 1;

    // Color scale: transparent (0) → deep blue → blue → yellow → orange → red (max)
    // Matches Figma Make export's heatColor() function
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = values[r * cols + c] / norm;
        if (v < 0.001) continue;

        let color: string;
        if (v < 0.1) {
          color = `rgba(30,58,138,${0.3 + v * 3})`;
        } else if (v < 0.3) {
          color = `rgba(29,78,216,${0.5 + v})`;
        } else if (v < 0.5) {
          color = `rgba(59,130,246,${0.7 + v * 0.3})`;
        } else if (v < 0.7) {
          color = `rgba(234,179,8,${0.7 + v * 0.3})`;
        } else if (v < 0.85) {
          color = `rgba(249,115,22,${0.8 + v * 0.2})`;
        } else {
          color = `rgba(239,68,68,${0.9 + v * 0.1})`;
        }

        ctx.fillStyle = color;
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(canvas.clientWidth, r * cellH);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, canvas.clientHeight);
      ctx.stroke();
    }

    // Y-axis labels (latency edges)
    ctx.fillStyle = "#666";
    ctx.font = "10px monospace";
    const edges = data.latencyEdgesMs;
    if (edges) {
      for (let r = 0; r < rows; r += Math.max(1, Math.floor(rows / 6))) {
        const y = (r + 0.5) * cellH;
        const label = edges[r] !== undefined ? `${Math.round(edges[r])}ms` : "";
        ctx.fillText(label, 4, y + 3);
      }
    }
  }, [data]);

  useEffect(() => { draw(); }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data || !onCellClick) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / (rect.width / data.cols));
    const row = Math.floor(y / (rect.height / data.rows));
    onCellClick(col, row);
  };

  return (
    <div className="chart-panel" style={{ flex: 1 }}>
      <div className="chart-title">Latency Heatmap</div>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{ width: "100%", height: "calc(100% - 28px)", cursor: "pointer" }}
      />
    </div>
  );
}
