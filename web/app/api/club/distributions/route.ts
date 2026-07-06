import { NextResponse } from "next/server";
import { requireClub } from "@/lib/clubAuth";
import { getClubDistributions, toDistributionDTO, toSeriesPointDTO } from "@/lib/clubRevenue";

export async function GET() {
  const c = await requireClub();
  if ("error" in c) return c.error;
  try {
    const { distributions, series } = await getClubDistributions(c.club.id);
    return NextResponse.json({ distributions: distributions.map(toDistributionDTO), series: series.map(toSeriesPointDTO) });
  } catch {
    return NextResponse.json({ distributions: [], series: [] });
  }
}
