"use client";

import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ReceiveDialog({
  open,
  onOpenChange,
  address,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
}) {
  async function copy() {
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive USD₮</DialogTitle>
          <DialogDescription>Only send USD₮ on Sepolia to this address.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={address} size={180} />
          </div>
          <code className="w-full break-all rounded-lg bg-secondary/40 p-3 text-center font-mono text-xs">{address}</code>
          <Button variant="outline" className="w-full" onClick={copy}>
            Copy address
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
