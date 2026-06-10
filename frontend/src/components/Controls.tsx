// frontend/src/components/Controls.tsx
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="flex items-center gap-4 px-5 py-2 bg-bg-secondary border-b border-border shrink-0 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onTogglePause}>
          {paused ? "▶ Resume" : "⏸ Pause"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onResetWindow} title="Reset to live following window">
          ⟲ Live
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-muted flex items-center gap-1">
          Rate:
          <Select value={String(emitRate)} onValueChange={(v) => onSetRate(Number(v))}>
            <SelectTrigger className="h-7 text-[11px] w-20 font-mono" aria-label="Emit rate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50" className="text-[11px] font-mono">50/s</SelectItem>
              <SelectItem value="100" className="text-[11px] font-mono">100/s</SelectItem>
              <SelectItem value="200" className="text-[11px] font-mono">200/s</SelectItem>
              <SelectItem value="500" className="text-[11px] font-mono">500/s</SelectItem>
              <SelectItem value="1000" className="text-[11px] font-mono">1000/s</SelectItem>
            </SelectContent>
          </Select>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="border-yellow/40 text-yellow hover:bg-yellow/10" onClick={onInjectSpike}>
          ⚡ Latency Spike
        </Button>
        <Button variant="outline" size="sm" className="border-red/40 text-red hover:bg-red/10" onClick={onInjectErrorBurst}>
          💥 Error Burst
        </Button>
      </div>
    </div>
  );
}
