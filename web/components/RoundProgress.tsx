import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsdt, formatCapMultiple, formatBps } from "@/lib/format";

type Props = {
  raised: bigint;
  goal: bigint;
  capMultiple: number; // bps-scaled, e.g. 15000 = 1.5x
  revenueBps: number;
  deadline: Date;
  status: "funding" | "active" | "closed";
};

const STATUS_LABEL: Record<Props["status"], string> = {
  funding: "En financiamiento",
  active: "Activa",
  closed: "Cerrada",
};

/** Pure display component — safe to render from a Server Component. */
export function RoundProgress({ raised, goal, capMultiple, revenueBps, deadline, status }: Props) {
  const pct = goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;

  return (
    <Card className="glow w-full p-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <Badge className="border-transparent bg-primary/15 text-primary">{STATUS_LABEL[status]}</Badge>
        <span className="text-muted-foreground">
          Cierra {deadline.toLocaleDateString("es-PE")}
        </span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-display text-3xl tracking-wide">
          {formatUsdt(raised)}{" "}
          <span className="font-sans text-sm font-normal text-muted-foreground">/ {formatUsdt(goal)} USD₮</span>
        </span>
        <span className="text-sm text-muted-foreground">{pct}%</span>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span>Reparto a hinchas: {formatBps(revenueBps)} de la recaudación</span>
        <span>Tope: {formatCapMultiple(capMultiple)}</span>
      </div>
    </Card>
  );
}
