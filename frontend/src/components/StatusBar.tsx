// frontend/src/components/StatusBar.tsx
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { WorkerStats } from "../worker/types";

interface Props {
  stats: WorkerStats | null;
  connected: boolean;
  paused: boolean;
  emitRate: number;
}

export function StatusBar({ stats, connected, paused, emitRate }: Props) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-1.5 text-[11px] font-mono text-text-muted bg-bg-muted border-b border-border shrink-0">
      <span className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-green shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-text-dim"}`} />
      <Badge variant={connected ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
        {connected ? "Worker Active" : "Offline"}
      </Badge>
      {stats && (
        <>
          <Separator orientation="vertical" className="h-3 bg-border" />
          <span>Spans: {stats.spansGeneratedTotal.toLocaleString()}</span>
        </>
      )}
      <Separator orientation="vertical" className="h-3 bg-border" />
      <span>Emit: {emitRate}/s</span>
      {paused && (
        <>
          <Separator orientation="vertical" className="h-3 bg-border" />
          <Badge variant="outline" className="text-[10px] text-yellow border-yellow/40 px-1.5 py-0 h-4">PAUSED</Badge>
        </>
      )}
    </div>
  );
}
