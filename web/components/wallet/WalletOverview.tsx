"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet, type WalletHandle } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";
import { parsePositionDTO, parseHistoryDTO, type FanPositionView, type HistoryEntryView } from "./types";
import { BalanceHero } from "./BalanceHero";
import { StatCards } from "./StatCards";
import { PositionsList } from "./PositionsList";
import { ActivityPanel } from "./ActivityPanel";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { AddFundsDialog } from "./AddFundsDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletOverview() {
  const { userId } = useCurrentUserId();
  const searchParams = useSearchParams();

  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [positions, setPositions] = useState<FanPositionView[]>([]);
  const [activity, setActivity] = useState<HistoryEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<null | "send" | "receive" | "addFunds">(
    searchParams.get("action") === "addFunds" ? "addFunds" : null,
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      await createWallet(userId); // no-op if it already exists
      const w = await getWallet(userId);
      setWallet(w);
      const [bal, posRes, histRes] = await Promise.all([
        w.getUsdtBalance(),
        fetch(`/api/wallet/positions?address=${w.address}`).then((r) => r.json()),
        fetch(`/api/wallet/history?address=${w.address}`).then((r) => r.json()),
      ]);
      setBalance(bal);
      setPositions((posRes.positions ?? []).map(parsePositionDTO));
      setActivity((histRes.entries ?? []).map(parseHistoryDTO));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-5xl border-destructive/40 bg-destructive/10 p-5 text-destructive">
        Could not load your wallet: {error}
      </Card>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.investedUsdt, 0n);
  const totalClaimable = positions.reduce((sum, p) => sum + p.claimable, 0n);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {wallet && (
          <BalanceHero
            address={wallet.address}
            balance={balance}
            onSend={() => setDialog("send")}
            onReceive={() => setDialog("receive")}
            onAddFunds={() => setDialog("addFunds")}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCards invested={totalInvested} claimable={totalClaimable} positions={positions.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-display text-xl uppercase tracking-wide">Your positions</h2>
          <PositionsList positions={positions} onClaimed={refresh} />
        </div>
        <ActivityPanel entries={activity} />
      </div>

      <SendDialog
        open={dialog === "send"}
        onOpenChange={(v) => setDialog(v ? "send" : null)}
        wallet={wallet}
        balance={balance}
        onSent={refresh}
      />
      <ReceiveDialog
        open={dialog === "receive"}
        onOpenChange={(v) => setDialog(v ? "receive" : null)}
        address={wallet?.address ?? ""}
      />
      <AddFundsDialog
        open={dialog === "addFunds"}
        onOpenChange={(v) => setDialog(v ? "addFunds" : null)}
        address={wallet?.address ?? ""}
        onFunded={refresh}
      />
    </div>
  );
}
