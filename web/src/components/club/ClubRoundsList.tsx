"use client";

import { RoundProgress } from "@/components/RoundProgress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatUsdt } from "@/lib/format";
import type { ClubRoundView } from "./types";

export function ClubRoundsList({
  rounds,
  onDistribute,
  onHolders,
  onCloseRound,
  onNewRound,
}: {
  rounds: ClubRoundView[];
  onDistribute: (r: ClubRoundView) => void;
  onHolders: (r: ClubRoundView) => void;
  onCloseRound: (r: ClubRoundView) => void;
  onNewRound: () => void;
}) {
  if (rounds.length === 0) {
    return (
      <Card className="items-start gap-2 p-6">
        <div className="text-sm text-muted-foreground">You haven&apos;t created a round yet.</div>
        <Button size="sm" onClick={onNewRound}>New round</Button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {rounds.map((r) => {
        const canDistribute = r.status === "active" && r.totalShares > 0n;
        return (
          <div key={r.roundId} className="flex flex-col gap-2">
            <RoundProgress raised={r.raised} goal={r.goal} capMultiple={r.capMultiple} revenueBps={r.revenueBps} deadline={r.deadline} status={r.status} distributed={r.distributed} />
            {r.status !== "funding" && (
              <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                <span aria-hidden>✓</span>
                <span>
                  {r.raised >= r.goal ? "Goal reached" : "Funding closed"} — {formatUsdt(r.raised)} USD₮ landed in your club wallet. Now report revenue with Distribute.
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onDistribute(r)} disabled={!canDistribute}>Distribute</Button>
              <Button size="sm" variant="outline" onClick={() => onHolders(r)}>Holders</Button>
              {r.status === "active" && (
                <Button
                  size="sm"
                  variant="destructive"
                  title="Retires this round for good — no more distributions. Holders keep whatever they've already accrued."
                  onClick={() => onCloseRound(r)}
                >
                  End round
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
