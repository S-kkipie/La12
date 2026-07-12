"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet } from "@/lib/wdk";
import { parseHistoryDTO, type HistoryEntryView } from "./types";
import { ActivityList } from "./ActivityList";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ActivityFull() {
  const { userId } = useCurrentUserId();
  const [entries, setEntries] = useState<HistoryEntryView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      await createWallet(userId);
      const w = await getWallet(userId);
      const res = await fetch(`/api/wallet/history?address=${w.address}`).then((r) => r.json());
      setEntries((res.entries ?? []).map(parseHistoryDTO));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-4 font-display text-3xl uppercase tracking-wide">Full ledger</h1>
      <Card className="p-5">
        {loading ? <Skeleton className="h-40 w-full" /> : <ActivityList entries={entries} />}
      </Card>
    </div>
  );
}
