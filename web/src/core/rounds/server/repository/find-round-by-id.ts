import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

export async function findRoundById(id: number): Promise<Round | undefined> {
  const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
  return round;
}
