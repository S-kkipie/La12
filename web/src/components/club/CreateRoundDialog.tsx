"use client";

import { CreateRoundForm } from "@/components/CreateRoundForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function CreateRoundDialog({
  open,
  onOpenChange,
  clubName,
  clubWalletAddress,
  usdtAddress,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}`;
  onCreated?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a round</DialogTitle>
          <DialogDescription>Deploy a new revenue-share round for {clubName}.</DialogDescription>
        </DialogHeader>
        <CreateRoundForm
          clubName={clubName}
          clubWalletAddress={clubWalletAddress}
          usdtAddress={usdtAddress}
          onCreated={() => {
            onCreated?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
