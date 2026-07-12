"use client";

import { useEffect, useState } from "react";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet } from "@/lib/wdk";
import { useWalletHistory } from "@/core/wallet/client/hooks";
import { ActivityList } from "./ActivityList";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ActivityFull() {
  const { userId } = useCurrentUserId();
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [resolving, setResolving] = useState(true);

  // Resolve the self-custody WDK wallet address client-side.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        await createWallet(userId); // no-op if it already exists
        const w = await getWallet(userId);
        if (cancelled) return;
        setAddress(w.address);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const histQuery = useWalletHistory(address);
  const entries = histQuery.data ?? [];
  const loading = resolving || (!!address && histQuery.isLoading);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-4 font-display text-3xl uppercase tracking-wide">Full ledger</h1>
      <Card className="p-5">
        {loading ? <Skeleton className="h-40 w-full" /> : <ActivityList entries={entries} />}
      </Card>
    </div>
  );
}
