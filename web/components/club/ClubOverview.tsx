"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { friendlyError } from "@/lib/txError";
import {
  parseClubTotals, parseClubRound, seriesToPoints,
  type ClubTotalsView, type ClubRoundView, type SeriesPointDTO,
} from "./types";
import { ClubHero } from "./ClubHero";
import { RevenueChart } from "./RevenueChart";
import { ClubRoundsList } from "./ClubRoundsList";
import { DistributeDialog } from "./DistributeDialog";
import { HoldersDialog } from "./HoldersDialog";
import { CreateRoundDialog } from "./CreateRoundDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ClubOverview({
  clubName,
  clubWalletAddress,
  usdtAddress,
}: {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}` | undefined;
}) {
  const searchParams = useSearchParams();
  const [totals, setTotals] = useState<ClubTotalsView | null>(null);
  const [rounds, setRounds] = useState<ClubRoundView[]>([]);
  const [points, setPoints] = useState<{ ts: number; usdt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [distributeRound, setDistributeRound] = useState<ClubRoundView | null>(null);
  const [holdersRound, setHoldersRound] = useState<ClubRoundView | null>(null);
  const [createOpen, setCreateOpen] = useState(searchParams.get("action") === "newRound");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [overview, dist] = await Promise.all([
        fetch("/api/club/overview").then((r) => r.json()),
        fetch("/api/club/distributions").then((r) => r.json()),
      ]);
      setTotals(parseClubTotals(overview.totals));
      setRounds((overview.rounds ?? []).map(parseClubRound));
      setPoints(seriesToPoints((dist.series ?? []) as SeriesPointDTO[]));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !totals) {
    return (
      <Card className="mx-auto max-w-4xl border-destructive/40 bg-destructive/10 p-5 text-destructive">
        Could not load your dashboard: {error ?? "unknown error"}
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ClubHero clubName={clubName} totals={totals} onNewRound={() => setCreateOpen(true)} />
      <RevenueChart points={points} />
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl uppercase tracking-wide">Your rounds</h2>
        <ClubRoundsList
          rounds={rounds}
          onDistribute={setDistributeRound}
          onHolders={setHoldersRound}
          onNewRound={() => setCreateOpen(true)}
        />
      </div>

      {distributeRound && (
        <DistributeDialog
          open={distributeRound !== null}
          onOpenChange={(v) => setDistributeRound(v ? distributeRound : null)}
          round={distributeRound}
          onDistributed={refresh}
        />
      )}
      {holdersRound && (
        <HoldersDialog
          open={holdersRound !== null}
          onOpenChange={(v) => setHoldersRound(v ? holdersRound : null)}
          round={holdersRound}
        />
      )}
      {usdtAddress && (
        <CreateRoundDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          clubName={clubName}
          clubWalletAddress={clubWalletAddress}
          usdtAddress={usdtAddress}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
