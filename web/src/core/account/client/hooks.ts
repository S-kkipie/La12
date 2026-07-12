"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Account-domain client hooks. `useLinkWallet` posts the caller's wallet
 *  address; on success it invalidates the wallet read caches so positions/
 *  history refetch once the address is known — mirrors myworkin's
 *  mutation-then-invalidateQueries pattern (cv-builder useCreate). */
export const useAccount = () => {
  const elysia = useElysia();
  const queryClient = useQueryClient();

  const useLinkWallet = () =>
    useMutation(
      elysia.account.wallet.post.mutationOptions({
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: elysia.wallet.positions.get.queryKey() });
          queryClient.invalidateQueries({ queryKey: elysia.wallet.history.get.queryKey() });
        },
      }),
    );

  return { useLinkWallet };
};
