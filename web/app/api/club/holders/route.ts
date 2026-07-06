import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import { requireClub } from "@/lib/clubAuth";
import { getRoundHolders, toHolderDTO } from "@/lib/clubRevenue";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const c = await requireClub();
  if ("error" in c) return c.error;

  const round = new URL(request.url).searchParams.get("round");
  if (!round || !ADDRESS_RE.test(round)) {
    return NextResponse.json({ error: "invalid round address" }, { status: 400 });
  }
  // Only scan a round that belongs to THIS club and is verified.
  const [owned] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, c.club.id), eq(rounds.contractAddress, round), eq(rounds.verified, true)));
  if (!owned) {
    return NextResponse.json({ error: "round not found for this club" }, { status: 403 });
  }

  try {
    const holders = await getRoundHolders(round as `0x${string}`);
    return NextResponse.json({ holders: holders.map(toHolderDTO) });
  } catch {
    return NextResponse.json({ holders: [] });
  }
}
