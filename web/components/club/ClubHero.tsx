"use client";

import { formatUsdt } from "@/lib/format";
import { WalletModeChip } from "@/components/shell/WalletModeChip";
import { Button } from "@/components/ui/button";
import type { ClubTotalsView } from "./types";

export function ClubHero({ clubName, totals, onNewRound }: { clubName: string; totals: ClubTotalsView; onNewRound: () => void }) {
  return (
    <div className="glow flex flex-col gap-6 rounded-xl bg-primary p-6 text-primary-foreground">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-70">Club revenue — {clubName}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <div className="text-xs opacity-70">Raised</div>
              <div className="font-display text-4xl tracking-wide">{formatUsdt(totals.raised)} <span className="text-xl">USD₮</span></div>
            </div>
            <div>
              <div className="text-xs opacity-70">Distributed</div>
              <div className="font-display text-4xl tracking-wide">{formatUsdt(totals.distributed)} <span className="text-xl">USD₮</span></div>
            </div>
          </div>
        </div>
        <WalletModeChip />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs opacity-80">{totals.roundCount} rounds · {totals.backerCount} backers</div>
        <Button variant="secondary" onClick={onNewRound}>New round</Button>
      </div>
    </div>
  );
}
