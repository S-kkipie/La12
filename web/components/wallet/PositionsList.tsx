"use client";

import Link from "next/link";
import { formatUsdt } from "@/lib/format";
import { percentOfRoundView } from "./positions-view";
import { ClaimPositionButton } from "./ClaimPositionButton";
import type { FanPositionView } from "./types";
import { Card } from "@/components/ui/card";

export function PositionsList({
  positions,
  onClaimed,
}: {
  positions: FanPositionView[];
  onClaimed: () => void;
}) {
  if (positions.length === 0) {
    return (
      <Card className="items-start gap-2 p-6">
        <div className="text-sm text-muted-foreground">You don&apos;t hold any club yet.</div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Explore clubs →
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {positions.map((p) => {
        const pct = p.goal > 0n ? Math.min(100, Number((p.raised * 100n) / p.goal)) : 0;
        return (
          <Card key={p.roundId} className="gap-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-2xl tracking-wide">{p.clubName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatUsdt(p.shares)} shares · {percentOfRoundView(p.shares, p.totalShares)}% of round
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Claimable</div>
                <div className="font-display text-xl tracking-wide text-primary">{formatUsdt(p.claimable)} USD₮</div>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Invested {formatUsdt(p.investedUsdt)} USD₮ · {p.status}
              </span>
              <ClaimPositionButton roundAddress={p.contractAddress} claimable={p.claimable} onClaimed={onClaimed} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
