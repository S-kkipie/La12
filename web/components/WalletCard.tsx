"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { walletMode } from "@/lib/walletMode";
import { usdtToFiat } from "@/lib/pricing";
import { getHistory, type HistoryEntry } from "@/lib/indexer";
import { formatUsdt, formatFiat } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletCard() {
  const { userId } = useCurrentUserId();
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [fiat, setFiat] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fundingMoonpay, setFundingMoonpay] = useState(false);
  const [fundingFaucet, setFundingFaucet] = useState(false);
  const [fundingGas, setFundingGas] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      // getWallet(), not createWallet's own address — in erc4337 mode the
      // linked/funded/read address is the smart account, not the EOA.
      const wallet = await getWallet(userId);
      setAddress(wallet.address);

      const bal = await wallet.getUsdtBalance();
      setBalance(bal);
      setFiat(await usdtToFiat(bal));
      setHistory(await getHistory(wallet.address));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function fundWithMoonpay() {
    if (!address) return;
    setFundingMoonpay(true);
    try {
      const res = await fetch("/api/moonpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amountUsd: 50 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo abrir MoonPay.");
        return;
      }
      window.open(data.widgetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setFundingMoonpay(false);
    }
  }

  async function fundWithTestFaucet() {
    if (!address) return;
    setFundingFaucet(true);
    const toastId = toast.loading("Consiguiendo USD₮ de prueba…");
    try {
      const res = await fetch("/api/faucet-usdt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo conseguir USD₮ de prueba.", { id: toastId });
        return;
      }
      toast.success("USD₮ de prueba recibido", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setFundingFaucet(false);
    }
  }

  async function fundWithGasFaucet() {
    if (!address) return;
    setFundingGas(true);
    const toastId = toast.loading("Consiguiendo ETH de gas…");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo conseguir ETH de gas.", { id: toastId });
        return;
      }
      toast.success("ETH de gas recibido", { id: toastId });
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setFundingGas(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-10 w-56" />
        <Skeleton className="mt-4 h-9 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/10 p-5 text-destructive-foreground">
        No se pudo cargar tu billetera: {error}
      </Card>
    );
  }

  return (
    <Card className="glow flex flex-col gap-4 p-5">
      <div>
        <div className="text-xs text-muted-foreground">Tu dirección</div>
        <div className="truncate font-mono text-sm">{address}</div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Balance USD₮</div>
        <div className="font-display text-5xl tracking-wide text-primary">
          {formatUsdt(balance ?? 0n)} <span className="font-sans text-2xl text-foreground">USD₮</span>
        </div>
        {fiat !== null && (
          <div className="text-sm text-muted-foreground">≈ {formatFiat(fiat)}</div>
        )}
      </div>

      <Button onClick={fundWithMoonpay} disabled={fundingMoonpay}>
        {fundingMoonpay ? "Abriendo MoonPay…" : "Fondear con MoonPay"}
      </Button>

      {walletMode() === "standard" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <span className="text-xs text-muted-foreground">Fondos de prueba — solo demo local</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={fundWithTestFaucet} disabled={fundingFaucet}>
              {fundingFaucet ? "Consiguiendo…" : "Conseguir 5,000 USD₮ de prueba"}
            </Button>
            <Button variant="outline" size="sm" onClick={fundWithGasFaucet} disabled={fundingGas}>
              {fundingGas ? "Consiguiendo…" : "Conseguir ETH de gas"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Gas pagado en USD₮ (sin ETH)
        </div>
      )}

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Movimientos</div>
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aún no hay movimientos.</div>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((entry) => (
              <li key={entry.hash} className="flex justify-between">
                <span>{entry.kind === "in" ? "Recibido" : "Enviado"}</span>
                <span className="font-mono">{formatUsdt(entry.amount)} USD₮</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
