"use client";

import { formatUsdt, formatRelativeTime, explorerTxUrl } from "@/lib/format";
import { useClubs } from "@/core/clubs/client/hooks";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RevenueDetail() {
  const { useOverview, useDistributions } = useClubs();
  const overviewQuery = useOverview();
  const distributionsQuery = useDistributions();

  const loading = overviewQuery.isLoading || distributionsQuery.isLoading;
  if (loading) return <Skeleton className="mx-auto h-64 w-full max-w-3xl" />;

  const rounds = overviewQuery.data?.rounds ?? [];
  const dists = distributionsQuery.data?.distributions ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Revenue</h1>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Cap utilization</h2>
        {rounds.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rounds yet.</div>
        ) : (
          rounds.map((r) => (
            <div key={r.roundId} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="text-muted-foreground">
                  {formatUsdt(r.distributed)} distributed · {r.capUtilizationPct}% of cap
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.capUtilizationPct}%` }} />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Distribution history</h2>
        {dists.length === 0 ? (
          <div className="text-sm text-muted-foreground">No distributions yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {dists.map((d) => (
              <li key={d.txHash} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm">{d.roundName}</div>
                  <a href={explorerTxUrl(d.txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                    {d.timestamp ? formatRelativeTime(d.timestamp) : ""}
                  </a>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-primary">+{formatUsdt(d.credited)} to holders</div>
                  {d.refunded > 0n && <div className="text-xs text-muted-foreground">{formatUsdt(d.refunded)} refunded (over cap)</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
