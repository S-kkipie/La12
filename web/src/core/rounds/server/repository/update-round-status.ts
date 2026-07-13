import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import type { RoundStatus } from "@/core/rounds/domain/types";

/** Corrects rounds.status to match the on-chain truth (never the other way). */
export async function updateRoundStatus(id: number, status: RoundStatus): Promise<void> {
  await db.update(rounds).set({ status }).where(eq(rounds.id, id));
}
