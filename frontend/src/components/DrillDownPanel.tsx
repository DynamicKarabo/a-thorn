// frontend/src/components/DrillDownPanel.tsx
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <Card className="shrink-0 max-h-[200px] p-0 overflow-hidden">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-dim px-3 py-2 border-b border-border">
          Trace Details
        </div>
        <div className="flex items-center justify-center h-20 text-sm text-text-muted">
          {!data
            ? "Click a heatmap cell to inspect traces"
            : "No spans in this bucket"}
        </div>
      </Card>
    );
  }

  return (
    <Card className="shrink-0 max-h-[200px] p-0 overflow-hidden flex flex-col">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-dim px-3 py-2 border-b border-border shrink-0">
        Trace Details ({data.count} spans)
      </div>
      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase">Time</TableHead>
              <TableHead className="text-[10px] uppercase">Service</TableHead>
              <TableHead className="text-[10px] uppercase">Endpoint</TableHead>
              <TableHead className="text-[10px] uppercase text-right">Latency</TableHead>
              <TableHead className="text-[10px] uppercase">Status</TableHead>
              <TableHead className="text-[10px] uppercase">Trace ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.spans.map((sp) => (
              <TableRow
                key={sp.traceId + sp.ts}
                className={sp.status >= 500 ? "bg-red/5" : sp.status >= 400 ? "bg-yellow/5" : ""}
              >
                <TableCell className="font-mono text-xs">{fmtTime(sp.ts)}</TableCell>
                <TableCell className="text-xs">{sp.service}</TableCell>
                <TableCell className="text-xs">{sp.endpoint}</TableCell>
                <TableCell className="text-right font-mono text-xs">{sp.latencyMs.toFixed(1)}ms</TableCell>
                <TableCell>
                  <Badge variant={sp.status >= 500 ? "destructive" : "default"} className="text-[10px] px-1.5 py-0 h-5">
                    {sp.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-text-muted">{sp.traceId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  );
}
