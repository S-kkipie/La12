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
    <div className="w-full rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          {STATUS_LABEL[status]}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          Cierra {deadline.toLocaleDateString("es-PE")}
        </span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg font-semibold">
          {formatUsdt(raised)} <span className="text-sm font-normal text-zinc-500">/ {formatUsdt(goal)} USD₮</span>
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{pct}%</span>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Reparto a hinchas: {formatBps(revenueBps)} de la recaudación</span>
        <span>Tope: {formatCapMultiple(capMultiple)}</span>
      </div>
    </div>
  );
}
