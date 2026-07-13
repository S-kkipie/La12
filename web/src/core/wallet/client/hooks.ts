"use client";
import { useQuery } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
import { parsePosition, parseHistoryEntry } from "@/core/wallet/domain/types";

/** Fan positions for `address`, parsed to bigint views. Disabled until address is known. */
export function useWalletPositions(address?: string) {
  const wallet = useElysia().wallet;
  return useQuery({
    ...wallet.positions.get.queryOptions({ address: address ?? "" }),
    enabled: !!address,
    select: (data) => (data.response ?? []).map(parsePosition),
  });
}

/** USD₮ transfer history for `address`, parsed to bigint views. */
export function useWalletHistory(address?: string) {
  const wallet = useElysia().wallet;
  return useQuery({
    ...wallet.history.get.queryOptions({ address: address ?? "" }),
    enabled: !!address,
    select: (data) => (data.response ?? []).map(parseHistoryEntry),
  });
}
