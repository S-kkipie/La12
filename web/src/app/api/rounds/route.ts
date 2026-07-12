import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";

// NOTE: no `clubId` field here — the caller's club is resolved from their own
// session (see POST below), never trusted from client input.
const createRoundSchema = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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

/**
 * Creates a round row for the caller's OWN club, after independently
 * verifying on-chain that the given contract really is theirs.
 *
 * `RoundFactory.createRound()` is permissionless — anyone can deploy a round
 * naming any address as `club`. So a session + role check alone isn't
 * enough: we also read the deployed round's own `club()` and require it to
 * match this account's registered wallet before trusting the submission
 * (and only then mark it `verified`). This is on top of, not instead of, the
 * role gate — a fan session is rejected before we even look at the body.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.role !== "club") {
    return NextResponse.json({ error: "Solo clubes pueden crear rondas" }, { status: 403 });
  }

  const parsed = createRoundSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
  if (!club) {
    return NextResponse.json(
      { error: "Tu cuenta de club todavía no tiene una wallet vinculada" },
      { status: 409 },
    );
  }

  const address = parsed.data.contractAddress as `0x${string}`;

  let onChainClub: string;
  try {
    onChainClub = (await publicClient.readContract({
      address,
      abi: revenueShareRoundAbi,
      functionName: "club",
    })) as string;
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo leer el contrato: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  if (onChainClub.toLowerCase() !== club.walletAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "El contrato de la ronda no pertenece a la wallet de este club" },
      { status: 400 },
    );
  }

  const [round] = await db
    .insert(rounds)
    .values({
      clubId: club.id,
      contractAddress: address,
      goal: parsed.data.goal,
      sharePrice: parsed.data.sharePrice,
      revenueBps: parsed.data.revenueBps,
      capMultiple: parsed.data.capMultiple,
      deadline: parsed.data.deadline,
      verified: true,
    })
    .returning();
  return NextResponse.json(round, { status: 201 });
}
