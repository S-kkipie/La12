import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";

// NOTE: intentionally no `verified` field here. RoundFactory.createRound() is
// permissionless on-chain, so a round showing up in `RoundCreated` proves
// nothing about who it's really for — every round this API creates starts
// unverified (schema default `false`) and stays that way until someone
// flips it by hand in the DB after checking the deploy. Even if a client
// sneaks a `verified` key into the request body, zod strips unknown keys
// from `parsed.data`, so it can never reach the insert.
const createRoundSchema = z.object({
  clubId: z.number().int().positive(),
  contractAddress: z.string().min(1),
  goal: z.string().min(1), // USD₮ base units, as a string (bigint precision)
  sharePrice: z.string().min(1),
  revenueBps: z.number().int().nonnegative(),
  capMultiple: z.number().int().positive(), // bps-scaled, e.g. 15000 = 1.5x
  deadline: z.coerce.date(),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clubId = params.get("clubId");
  const includeAll = params.get("all") === "1"; // opt-in: include unverified rows too

  const conditions = [
    clubId ? eq(rounds.clubId, Number(clubId)) : undefined,
    includeAll ? undefined : eq(rounds.verified, true),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(rounds)
          .where(and(...conditions))
      : await db.select().from(rounds);

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = createRoundSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [club] = await db.select().from(clubs).where(eq(clubs.id, parsed.data.clubId));
  if (!club) {
    return NextResponse.json({ error: "club not found" }, { status: 404 });
  }

  const [round] = await db.insert(rounds).values(parsed.data).returning();
  return NextResponse.json(round, { status: 201 });
}
