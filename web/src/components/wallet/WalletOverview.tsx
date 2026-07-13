"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet, type WalletHandle } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";
import { useWalletPositions, useWalletHistory } from "@/core/wallet/client/hooks";
import { usePricing } from "@/core/pricing/client/hooks";
import { useCurrency } from "@/core/pricing/client/use-currency";
import { BalanceHero } from "./BalanceHero";
import { StatCards } from "./StatCards";
import { PositionsList } from "./PositionsList";
import { ActivityPanel } from "./ActivityPanel";
import { CurrencySelect } from "./CurrencySelect";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { AddFundsDialog } from "./AddFundsDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletOverview() {
  const { userId } = useCurrentUserId();
  const searchParams = useSearchParams();

  // Display currency + its USD₮→fiat rate — one page-level fetch, threaded into
  // the balance + position cards. Rates are display-only; money stays USD₮.
  const [currency, setCurrency] = useCurrency();
  const rateQuery = usePricing().useRate(currency);
  const rate = rateQuery.data?.rate ?? 1;
  const rateSource = rateQuery.data?.source ?? "fallback";

  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [resolving, setResolving] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<null | "send" | "receive" | "addFunds">(
    searchParams.get("action") === "addFunds" ? "addFunds" : null,
  );

  // Resolve the self-custody WDK wallet (address + USD₮ balance) client-side.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setWalletError(null);
      try {
        await createWallet(userId); // no-op if it already exists
        const w = await getWallet(userId);
        if (cancelled) return;
        setWallet(w);
        setBalance(await w.getUsdtBalance());
      } catch (err) {
        if (!cancelled) setWalletError(friendlyError(err));
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const address = wallet?.address;
  const posQuery = useWalletPositions(address);
  const histQuery = useWalletHistory(address);
  const positions = posQuery.data ?? [];
  const activity = histQuery.data ?? [];

  const loading = resolving || (!!address && (posQuery.isLoading || histQuery.isLoading));
  const error = walletError; // read failures degrade to empty per the API contract

  const refetchWallet = () => {
    const rereadBalance = () => {
      // Re-read the on-chain USD₮ balance — a claim/send/add-funds changed it.
      if (wallet) void wallet.getUsdtBalance().then(setBalance).catch(() => {});
    };
    // Refetch the exact position/history queries directly — invalidateQueries by
    // key didn't reliably retrigger these, so a claim left stale numbers until reload.
    void posQuery.refetch();
    void histQuery.refetch();
    rereadBalance();
    // The USD₮ transfer history (indexer/RPC-log backed) and balance can trail a
    // just-confirmed tx by ~a block; settle once more shortly so no manual reload.
    window.setTimeout(() => {
      void posQuery.refetch();
      void histQuery.refetch();
      rereadBalance();
    }, 3000);
  };

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
      <div className="flex items-center justify-end">
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {wallet && (
          <BalanceHero
            address={wallet.address}
            balance={balance}
            rate={rate}
            source={rateSource}
            currency={currency}
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
          <PositionsList
            positions={positions}
            rate={rate}
            source={rateSource}
            currency={currency}
            onClaimed={refetchWallet}
          />
        </div>
        <ActivityPanel entries={activity} />
      </div>

      <SendDialog
        open={dialog === "send"}
        onOpenChange={(v) => setDialog(v ? "send" : null)}
        wallet={wallet}
        balance={balance}
        onSent={refetchWallet}
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
        onFunded={refetchWallet}
      />
    </div>
  );
}
