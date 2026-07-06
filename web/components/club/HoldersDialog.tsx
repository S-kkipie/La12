"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { parseHolder, type HolderView } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export function HoldersDialog({
  open,
  onOpenChange,
  round,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: { contractAddress: `0x${string}`; name: string };
}) {
  const [holders, setHolders] = useState<HolderView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/club/holders?round=${round.contractAddress}`).then((r) => r.json());
      setHolders((res.holders ?? []).map(parseHolder));
    } finally {
      setLoading(false);
    }
  }, [round.contractAddress]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backers</DialogTitle>
          <DialogDescription>{round.name}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : holders.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No backers yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {holders.map((h) => (
              <li key={h.address} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <a href={explorerTxUrl(h.address).replace("/tx/", "/address/")} target="_blank" rel="noopener noreferrer" className="font-mono text-sm hover:text-primary">
                    {shortenAddress(h.address)}
                  </a>
                  <div className="text-xs text-muted-foreground">{h.pct}% of round</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatUsdt(h.shares)} shares</div>
                  <div className="text-xs text-muted-foreground">claimable {formatUsdt(h.claimable)} USD₮</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
