import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
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

  // Browsing stays public (discovery); only investing requires a session.
  const session = await auth.api.getSession({ headers: await headers() });

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
          {session ? (
            <InvestForm roundAddress={round.contractAddress as `0x${string}`} />
          ) : (
            <div className="rounded-xl border border-black/10 bg-white p-5 text-sm text-zinc-600 dark:border-white/10 dark:bg-black dark:text-zinc-400">
              <Link href="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
                Iniciá sesión
              </Link>{" "}
              para invertir en este club.
            </div>
          )}
        </section>
      ) : (
        <p className="text-zinc-500">Este club todavía no tiene una ronda activa.</p>
      )}
    </div>
  );
}
