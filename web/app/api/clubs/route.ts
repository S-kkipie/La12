import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";

const createClubSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().optional(),
  description: z.string().optional(),
  walletAddress: z.string().min(1),
});

export async function GET() {
  const rows = await db.select().from(clubs);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const parsed = createClubSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [club] = await db.insert(clubs).values(parsed.data).returning();
  return NextResponse.json(club, { status: 201 });
}
