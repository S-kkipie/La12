import { formatUsdt } from "@/lib/format";
import { Card } from "@/components/ui/card";

export function StatCards({
  invested,
  claimable,
  positions,
}: {
  invested: bigint;
  claimable: bigint;
  positions: number;
}) {
  const stats = [
    { label: "Invested", value: `${formatUsdt(invested)} USD₮` },
    { label: "Claimable", value: `${formatUsdt(claimable)} USD₮` },
    { label: "Positions", value: String(positions) },
  ];
  return (
    <>
      {stats.map((s) => (
        <Card key={s.label} className="gap-1 p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
          <div className="font-display text-3xl tracking-wide">{s.value}</div>
        </Card>
      ))}
    </>
  );
}
