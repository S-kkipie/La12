"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Round-domain client hooks. `useList` is public (no clubAuthed); `useCreate`
 *  requires a club session (enforced server-side by clubAuthed); `useCloseCheck`
 *  is public and permissionless (see close-check.route.ts) — InvestForm fires
 *  it and ignores the result, matching the legacy fire-and-forget fetch. */
export const useRounds = () => {
  const elysia = useElysia();
  const queryClient = useQueryClient();

  const useList = (query: { clubId?: number; all?: string } = {}) =>
    useQuery(elysia.rounds.get.queryOptions({ query }));

  const useCreate = () =>
    useMutation(
      elysia.rounds.post.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: elysia.rounds.get.queryKey() }),
      }),
    );

  // Path-param call-shape confirmed against the eden treaty in Step 2 below —
  // Elysia's `:id` segment becomes a callable `elysia.rounds({ id })`, and the
  // hyphenated `close-check` segment needs bracket access. `id` is taken as a
  // hook parameter (InvestForm already has `roundId` as a prop) rather than a
  // mutate-time argument, since the path itself must be known before the
  // mutation is constructed.
  const useCloseCheck = (id: number) => useMutation(elysia.rounds({ id })["close-check"].post.mutationOptions());

  return { useList, useCreate, useCloseCheck };
};
