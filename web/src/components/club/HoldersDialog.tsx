"use client";

import { formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { useClubs } from "@/core/clubs/client/hooks";
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
  const { useHolders } = useClubs();
  const holdersQuery = useHolders(round.contractAddress);
  const holders = holdersQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backers</DialogTitle>
          <DialogDescription>{round.name}</DialogDescription>
        </DialogHeader>
        {holdersQuery.isLoading ? (
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
