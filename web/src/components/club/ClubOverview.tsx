"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useClubs } from "@/core/clubs/client/hooks";
import { seriesToPoints, type ClubRoundView } from "./types";
import { ClubHero } from "./ClubHero";
import { RevenueChart } from "./RevenueChart";
import { ClubRoundsList } from "./ClubRoundsList";
import { DistributeDialog } from "./DistributeDialog";
import { CloseRoundDialog } from "./CloseRoundDialog";
import { HoldersDialog } from "./HoldersDialog";
import { CreateRoundDialog } from "./CreateRoundDialog";
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
  const { useOverview, useDistributions } = useClubs();
  const overviewQuery = useOverview();
  const distributionsQuery = useDistributions();

  const [distributeRound, setDistributeRound] = useState<ClubRoundView | null>(null);
  const [holdersRound, setHoldersRound] = useState<ClubRoundView | null>(null);
  const [closeRoundTarget, setCloseRoundTarget] = useState<ClubRoundView | null>(null);
  const [createOpen, setCreateOpen] = useState(searchParams.get("action") === "newRound");

  const handleNewRound = useCallback(() => {
    if (!usdtAddress) {
      toast.error("USD₮ address not configured — rounds can't be created.");
      return;
    }
    setCreateOpen(true);
  }, [usdtAddress]);

  const refresh = useCallback(() => {
    const run = () => {
      void overviewQuery.refetch();
      void distributionsQuery.refetch();
    };
    run();
    // Distribution logs (revenue chart + cap progress) can trail a just-confirmed
    // distribute/close by ~a block; settle once more shortly so no manual reload.
    window.setTimeout(run, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = overviewQuery.isLoading || distributionsQuery.isLoading;

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // The overview/distributions services are graceful-empty (200 on any read
  // failure) — a query error here is a network/transport failure, not an API
  // 4xx/5xx. Fall back to zeroed data rather than blocking the dashboard.
  const totals = overviewQuery.data?.totals ?? { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 };
  const rounds = overviewQuery.data?.rounds ?? [];
  const points = seriesToPoints(distributionsQuery.data?.series ?? []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ClubHero clubName={clubName} totals={totals} onNewRound={handleNewRound} />
      <RevenueChart points={points} />
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl uppercase tracking-wide">Your rounds</h2>
        <ClubRoundsList
          rounds={rounds}
          onDistribute={setDistributeRound}
          onHolders={setHoldersRound}
          onCloseRound={setCloseRoundTarget}
          onNewRound={handleNewRound}
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
      {closeRoundTarget && (
        <CloseRoundDialog
          open={closeRoundTarget !== null}
          onOpenChange={(v) => setCloseRoundTarget(v ? closeRoundTarget : null)}
          round={closeRoundTarget}
          onClosed={refresh}
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
