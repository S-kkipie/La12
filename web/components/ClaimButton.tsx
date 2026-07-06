"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { claim, pendingReward } from "@/lib/contracts";
import { formatUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  roundAddress: `0x${string}`;
};

export function ClaimButton({ roundAddress }: Props) {
  const { userId } = useCurrentUserId();
  const [pending, setPending] = useState<bigint | null>(null);
  const [status, setStatus] = useState<"idle" | "claiming">("idle");

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      // getWallet(), not createWallet's own address — in erc4337 mode the
      // reward accrues to the smart account, not the EOA.
      const wallet = await getWallet(userId);
      setPending(await pendingReward(roundAddress, wallet.address));
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }, [roundAddress, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleClaim() {
    if (!userId) return;
    setStatus("claiming");
    const toastId = toast.loading("Claiming…");
    try {
      // claim() pulls nothing from the caller (only pays out) — no approve needed.
      const wallet = await getWallet(userId);
      await claim(wallet, roundAddress);

      toast.success("Claimed!", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setStatus("idle");
    }
  }

  const hasReward = (pending ?? 0n) > 0n;

  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="text-xs text-muted-foreground">Your pending reward</div>
      <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(pending ?? 0n)} USD₮</div>
      <Button
        className="mt-2 self-start"
        onClick={handleClaim}
        disabled={!userId || !hasReward || status === "claiming"}
      >
        {status === "claiming" ? "Claiming…" : "Claim"}
      </Button>
    </Card>
  );
}
