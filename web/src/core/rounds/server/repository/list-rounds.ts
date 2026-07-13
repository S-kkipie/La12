import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

export type ListRoundsFilter = { clubId?: number; includeAll?: boolean };

/** Public catalog list — filters clubId + verified (unless includeAll). */
export async function listRounds(filter: ListRoundsFilter): Promise<Round[]> {
  const conditions = [
    filter.clubId !== undefined ? eq(rounds.clubId, filter.clubId) : undefined,
    filter.includeAll ? undefined : eq(rounds.verified, true),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  return conditions.length > 0 ? db.select().from(rounds).where(and(...conditions)) : db.select().from(rounds);
}
