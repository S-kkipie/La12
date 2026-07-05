import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { DistributeForm } from "@/components/DistributeForm";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ClubPanelPage({ params }: Props) {
  const { slug } = await params;

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug));
  if (!club) notFound();

  // Verified-only — same reasoning as the other pages (schema.ts). The panel
  // triggers a real on-chain `distribute()`, so this is the last place we'd
  // want to point at an unvetted contract address.
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, club.id), eq(rounds.verified, true)));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <span className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
          Panel del club
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{club.name}</h1>
      </header>

      {round ? (
        <DistributeForm roundAddress={round.contractAddress as `0x${string}`} />
      ) : (
        <p className="text-zinc-500">Este club todavía no tiene una ronda activa.</p>
      )}
    </div>
  );
}
