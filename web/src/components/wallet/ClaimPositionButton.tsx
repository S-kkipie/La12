"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { getWallet } from "@/lib/wdk";
import { claim } from "@/lib/contracts";
import { friendlyError } from "@/lib/txError";
import { Button } from "@/components/ui/button";

export function ClaimPositionButton({
  roundAddress,
  claimable,
  onClaimed,
}: {
  roundAddress: `0x${string}`;
  claimable: bigint;
  onClaimed?: () => void;
}) {
  const { userId } = useCurrentUserId();
  const [status, setStatus] = useState<"idle" | "claiming">("idle");
  const hasReward = claimable > 0n;

  async function handleClaim() {
    if (!userId) return;
    setStatus("claiming");
    const toastId = toast.loading("Claiming…");
    try {
      const wallet = await getWallet(userId);
      await claim(wallet, roundAddress);
      toast.success("Claimed!", { id: toastId });
      onClaimed?.();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <Button size="sm" onClick={handleClaim} disabled={!userId || !hasReward || status === "claiming"}>
      {status === "claiming" ? "Claiming…" : "Claim"}
    </Button>
  );
}
