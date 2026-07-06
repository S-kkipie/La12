import { NextResponse } from "next/server";
import { requireClub } from "@/lib/clubAuth";
import { getClubOverview, toClubTotalsDTO, toClubRoundDTO } from "@/lib/clubRevenue";

export async function GET() {
  const c = await requireClub();
  if ("error" in c) return c.error;
  try {
    const { totals, rounds } = await getClubOverview(c.club.id);
    return NextResponse.json({ totals: toClubTotalsDTO(totals), rounds: rounds.map(toClubRoundDTO) });
  } catch {
    return NextResponse.json({ totals: { raised: "0", distributed: "0", roundCount: 0, backerCount: 0 }, rounds: [] });
  }
}
