import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { totalRaised, readSafely } from "@/lib/contracts";
import { RoundProgress } from "@/components/RoundProgress";
import { InvestForm } from "@/components/InvestForm";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ClubPage({ params }: Props) {
  const { slug } = await params;

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug));
  if (!club) notFound();

  // Only a verified round can be shown/invested in — see schema.ts on why an
  // unvetted row (clubId matches, contractAddress doesn't) can't be trusted.
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, club.id), eq(rounds.verified, true)));
  const raised = round
    ? await readSafely(() => totalRaised(round.contractAddress as `0x${string}`), 0n)
    : 0n;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{club.name}</h1>
        {club.description && (
          <p className="max-w-xl text-zinc-600 dark:text-zinc-400">{club.description}</p>
        )}
      </header>

      {round ? (
        <section className="flex flex-col gap-4">
          <RoundProgress
            raised={raised}
            goal={BigInt(round.goal)}
            capMultiple={round.capMultiple}
            revenueBps={round.revenueBps}
            deadline={round.deadline}
            status={round.status}
          />
          <InvestForm roundAddress={round.contractAddress as `0x${string}`} />
        </section>
      ) : (
        <p className="text-zinc-500">Este club todavía no tiene una ronda activa.</p>
      )}
    </div>
  );
}
