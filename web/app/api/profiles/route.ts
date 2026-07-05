import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/db/schema";

const createProfileSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  displayName: z.string().optional(),
});

export async function GET(request: Request) {
  const walletAddress = new URL(request.url).searchParams.get("walletAddress");
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.walletAddress, walletAddress.toLowerCase()));

  return NextResponse.json(profile ?? null);
}

export async function POST(request: Request) {
  const parsed = createProfileSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const walletAddress = parsed.data.walletAddress.toLowerCase();
  const [existing] = await db.select().from(profiles).where(eq(profiles.walletAddress, walletAddress));
  if (existing) {
    return NextResponse.json(existing);
  }

  const [profile] = await db
    .insert(profiles)
    .values({ walletAddress, displayName: parsed.data.displayName })
    .returning();
  return NextResponse.json(profile, { status: 201 });
}
