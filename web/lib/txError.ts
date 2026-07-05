// Maps a thrown error (viem walletClient/publicClient calls, or a plain WDK
// Error) to a short, Spanish, user-facing message. Never surfaces the raw
// hex/ABI dump viem errors otherwise print — those are great for our logs,
// terrible for a fan staring at a toast.
import { BaseError } from "viem";

/** Known on-chain revert reasons for RevenueShareRound (see contracts/src). */
const KNOWN_REVERTS: Array<[needle: string, message: string]> = [
  ["insufficientallowance", "Falta aprobar USD₮ (reintentá, ahora aprueba solo)"],
  ["insufficientbalance", "USD₮ insuficiente — usá 'Conseguir USD₮ de prueba'"],
  ["exceeds balance", "USD₮ insuficiente — usá 'Conseguir USD₮ de prueba'"],
  ["user rejected", "Cancelaste la transacción"],
  [" 4001", "Cancelaste la transacción"],
  ["insufficient funds", "Sin ETH para gas — reintentá (faucet de gas)"],
  ["not funding", "La ronda ya cerró el financiamiento"],
  ["not active", "La ronda todavía no está activa"],
  ["nothing to claim", "No tenés recompensa pendiente para reclamar"],
  ["goal/deadline not met", "La ronda no llegó a la meta ni venció el plazo"],
];

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const root = err.walk() as { message?: string; shortMessage?: string } | null;
    const haystack = [err.shortMessage, err.details, root?.message]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const [needle, message] of KNOWN_REVERTS) {
      if (haystack.includes(needle)) return message;
    }

    return err.shortMessage || "Error en la transacción";
  }

  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    for (const [needle, message] of KNOWN_REVERTS) {
      if (lower.includes(needle)) return message;
    }
    return err.message;
  }

  return "Error en la transacción";
}
