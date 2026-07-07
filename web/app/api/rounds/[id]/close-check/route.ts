import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import { tryCloseFundingIfDue } from "@/lib/closeFunding";

/**
 * Public and unauthenticated on purpose: it only ever reads on-chain state
 * and, if due, performs the same permissionless `closeFunding()` call anyone
 * could already send directly — there's no privileged action to gate here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [round] = await db.select().from(rounds).where(eq(rounds.id, Number(id)));
  if (!round) {
    return NextResponse.json({ error: "round not found" }, { status: 404 });
  }

  const status = await tryCloseFundingIfDue(round);
  return NextResponse.json({ status });
}
