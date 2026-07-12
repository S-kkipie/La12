import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, profiles } from "@/db/schema";

const walletSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// Matches Unicode combining diacritical marks (U+0300-U+036F) so accents
// dropped by NFD normalization (e.g. "í" -> "i" + mark) get stripped.
const COMBINING_MARKS = /[̀-ͯ]/gu;

function slugify(name: string): string {
  const noAccents = name.normalize("NFD").replace(COMBINING_MARKS, "");
  const dashed = noAccents.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return dashed.replace(/(^-+|-+$)/g, "") || "club";
}

/**
 * Links the caller's WDK wallet address to their account (spec: self-custody
 * stays — the seed never leaves the browser, only the public address is
 * stored here). Called right after signup, and safe to call again later
 * (upserts). The role and identity come from the session, never from the
 * request body — a client can't claim to be someone else's club or fan.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = walletSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { walletAddress } = parsed.data;
  const { id: userId, role, name } = session.user;

  if (role === "club") {
    const [existing] = await db.select().from(clubs).where(eq(clubs.userId, userId));
    if (existing) {
      const [updated] = await db
        .update(clubs)
        .set({ walletAddress })
        .where(eq(clubs.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }

    const baseSlug = slugify(name);
    let slug = baseSlug;
    for (let n = 2; (await db.select().from(clubs).where(eq(clubs.slug, slug))).length > 0; n++) {
      slug = `${baseSlug}-${n}`;
    }

    const [club] = await db
      .insert(clubs)
      .values({ userId, name, slug, walletAddress })
      .returning();
    return NextResponse.json(club, { status: 201 });
  }

  // fan
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (existing) {
    const [updated] = await db
      .update(profiles)
      .set({ walletAddress })
      .where(eq(profiles.id, existing.id))
      .returning();
    return NextResponse.json(updated);
  }

  const [profile] = await db
    .insert(profiles)
    .values({ userId, walletAddress, displayName: name })
    .returning();
  return NextResponse.json(profile, { status: 201 });
}
