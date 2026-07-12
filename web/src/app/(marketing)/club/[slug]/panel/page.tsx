import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Superseded by /dashboard, which derives "which club" from the session
 * instead of a public slug (the old version here rendered a distribute
 * form for whichever browser happened to load the page — no ownership
 * check at all). Kept only so old links redirect instead of 404ing.
 */
export default async function ClubPanelPage({ params }: Props) {
  const { slug } = await params;

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug));
  if (!club) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // /dashboard re-derives the caller's own club from the session and 403s
  // (via redirect to /wallet) any non-club role — never renders another
  // club's controls, regardless of which slug brought you here.
  redirect("/dashboard");
}
