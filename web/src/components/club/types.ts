// Re-exports the clubs domain's bigint "view" types for components that don't
// fetch data themselves (ClubHero, ClubRoundsList, DistributeDialog,
// CloseRoundDialog) — they only need the shapes, not the fetch/parse layer,
// which now lives in core/clubs/domain/types.ts + core/clubs/client/hooks.ts.
export type {
  ClubTotals as ClubTotalsView,
  ClubRound as ClubRoundView,
  Distribution as DistributionView,
  Holder as HolderView,
} from "@/core/clubs/domain/types";
import type { SeriesPoint } from "@/core/clubs/domain/types";

/** Series → chart points in whole USD₮ (display only; number is fine for an axis). */
export function seriesToPoints(series: SeriesPoint[]): { ts: number; usdt: number }[] {
  return series.map((p) => ({ ts: p.ts, usdt: Number(p.cumulative) / 1_000_000 }));
}
