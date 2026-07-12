"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { formatUsdt, shortenAddress } from "@/lib/format";
import { WalletModeChip } from "@/components/shell/WalletModeChip";
import { Button } from "@/components/ui/button";

export function BalanceHero({
  address,
  balance,
  onSend,
  onReceive,
  onAddFunds,
}: {
  address: string;
  balance: bigint;
  onSend: () => void;
  onReceive: () => void;
  onAddFunds: () => void;
}) {
  async function copy() {
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  }

  return (
    <div className="glow flex flex-col gap-6 rounded-xl bg-primary p-6 text-primary-foreground md:col-span-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-70">USD₮ balance</div>
          <div className="font-display text-5xl tracking-wide md:text-6xl">
            {formatUsdt(balance)} <span className="text-2xl">USD₮</span>
          </div>
        </div>
        <WalletModeChip />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={copy} className="flex items-center gap-1.5 font-mono text-xs opacity-80 hover:opacity-100">
          {shortenAddress(address)} <Copy className="size-3" />
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSend}>Send</Button>
          <Button variant="secondary" onClick={onReceive}>Receive</Button>
          <Button variant="secondary" onClick={onAddFunds}>Add funds</Button>
        </div>
      </div>
    </div>
  );
}
