"use client";
import { useQuery } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
import {
  parseClubTotals,
  parseClubRound,
  parseDistribution,
  parseSeriesPoint,
  parseHolder,
} from "@/core/clubs/domain/types";

/** Club-domain client hooks — all three reads sit behind clubAuthed on the
 *  server (401/403/409 come from the session, not from these hooks). */
export const useClubs = () => {
  const elysia = useElysia().clubs;

  const useOverview = () =>
    useQuery({
      ...elysia.overview.get.queryOptions(),
      select: (data) => ({
        totals: parseClubTotals(data.response.totals),
        rounds: data.response.rounds.map(parseClubRound),
      }),
    });

  const useDistributions = () =>
    useQuery({
      ...elysia.distributions.get.queryOptions(),
      select: (data) => ({
        distributions: data.response.distributions.map(parseDistribution),
        series: data.response.series.map(parseSeriesPoint),
      }),
    });

  const useHolders = (round?: string) =>
    useQuery({
      ...elysia.holders.get.queryOptions({ query: { round: round ?? "" } }),
      enabled: !!round,
      select: (data) => data.response.map(parseHolder),
    });

  return { useOverview, useDistributions, useHolders };
};
