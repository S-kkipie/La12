"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { getWallet } from "@/lib/wdk";
import { closeRound } from "@/lib/contracts";
import { explorerTxUrl } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import type { ClubRoundView } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CloseRoundDialog({
  open,
  onOpenChange,
  round,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: ClubRoundView;
  onClosed?: () => void;
}) {
  const { userId } = useCurrentUserId();
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    if (!userId) return;
    setBusy(true);
    const toastId = toast.loading("Closing round…");
    try {
      const wallet = await getWallet(userId);
      const hash = await closeRound(wallet, round.contractAddress);
      toast.success("Round closed", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank", "noopener,noreferrer") },
      });
      onClosed?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setBusy(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close round</DialogTitle>
          <DialogDescription>
            This retires {round.name} for good. No further distributions can be sent — holders
            keep whatever they&apos;ve already accrued and can still claim it. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={handleClose} disabled={busy}>
            {busy ? "Closing…" : "Close round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
