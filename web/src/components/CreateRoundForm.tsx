"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet } from "@/lib/wdk";
import { createRoundOnChain } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { useRounds } from "@/core/rounds/client/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}`;
  onCreated?: () => void;
};

/** Deploys a real RevenueShareRound via RoundFactory, then registers it. */
export function CreateRoundForm({ clubName, clubWalletAddress, usdtAddress, onCreated }: Props) {
  const router = useRouter();
  const { userId } = useCurrentUserId();
  const { useCreate } = useRounds();
  const createRound = useCreate();
  const [goal, setGoal] = useState("40000");
  const [sharePrice, setSharePrice] = useState("1");
  const [revenueBps, setRevenueBps] = useState("800");
  const [capMultiple, setCapMultiple] = useState("15000");
  const [deadlineDays, setDeadlineDays] = useState("90");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!userId) return;
    setSubmitting(true);
    const toastId = toast.loading("Deploying round…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86_400);

      const contractAddress = await createRoundOnChain(wallet, {
        name: `${clubName} Round`,
        symbol: "LDR",
        usdtToken: usdtAddress,
        club: clubWalletAddress,
        goal: parseUsdt(goal),
        sharePriceUsdt: parseUsdt(sharePrice),
        revenueBps: BigInt(revenueBps),
        capMultiple: BigInt(capMultiple),
        deadline,
      });

      toast.loading("Registering round…", { id: toastId });
      try {
        await createRound.mutateAsync({
          contractAddress,
          goal: parseUsdt(goal).toString(),
          sharePrice: parseUsdt(sharePrice).toString(),
          revenueBps: Number(revenueBps),
          capMultiple: Number(capMultiple),
          deadline: new Date(Number(deadline) * 1000),
        });
      } catch {
        // eden-tanstack's mutationFn throws result.error on an API error, so
        // mutateAsync rejects on failure — normalize to one friendly message,
        // caught uniformly below alongside the on-chain-deploy failure path.
        throw new Error("No se pudo registrar la ronda");
      }

      toast.success("Round created!", { id: toastId });
      onCreated?.();
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-2xl tracking-wide">Create new round</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-goal">Goal (USD₮)</Label>
          <Input id="cr-goal" type="number" min="1" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-price">Price per share (USD₮)</Label>
          <Input id="cr-price" type="number" min="0.01" step="0.01" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-bps">Revenue share (bps, 800 = 8%)</Label>
          <Input id="cr-bps" type="number" min="1" max="10000" value={revenueBps} onChange={(e) => setRevenueBps(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-cap">Cap (bps, 15000 = 1.5x)</Label>
          <Input id="cr-cap" type="number" min="1" value={capMultiple} onChange={(e) => setCapMultiple(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-days">Deadline (days)</Label>
          <Input id="cr-days" type="number" min="1" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} />
        </div>
      </div>
      <Button className="self-start" onClick={handleCreate} disabled={!userId || submitting}>
        {submitting ? "Deploying…" : "Create round"}
      </Button>
    </Card>
  );
}
