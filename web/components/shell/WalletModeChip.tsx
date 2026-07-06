"use client";

import { Badge } from "@/components/ui/badge";
import { walletMode } from "@/lib/walletMode";

export function WalletModeChip() {
  const mode = walletMode();
  return (
    <Badge className="border-transparent bg-secondary text-secondary-foreground">
      {mode === "erc4337" ? "Gas in USD₮" : "Sepolia testnet"}
    </Badge>
  );
}
