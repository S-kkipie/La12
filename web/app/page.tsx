import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { totalRaised, readSafely } from "@/lib/contracts";
import { RoundProgress } from "@/components/RoundProgress";
import { EntrarButton } from "@/components/EntrarButton";

const FEATURED_SLUG = "deportivo-san-martin";

export default async function Home() {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, FEATURED_SLUG));
  // Only ever surface a *verified* round (see schema.ts) — RoundFactory's
  // createRound() is permissionless on-chain, so anyone could otherwise POST
  // a lookalike round under this same club id and have it shown/invested in.
  const [round] = club
    ? await db
        .select()
        .from(rounds)
        .where(and(eq(rounds.clubId, club.id), eq(rounds.verified, true)))
    : [];
  const raised = round
    ? await readSafely(() => totalRaised(round.contractAddress as `0x${string}`), 0n)
    : 0n;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <span className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
          La Doce
        </span>
        <h1 className="text-4xl font-bold tracking-tight">
          Sé socio de tu club, en USD₮.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Financiá la temporada de tu club y cobrá tu parte de la recaudación —
          sin banco, sin custodia, con tu propia billetera.
        </p>
        <EntrarButton />
      </header>

      {club && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Club destacado
          </h2>
          <Link
            href={`/club/${club.slug}`}
            className="rounded-xl border border-black/10 p-6 transition-colors hover:border-emerald-600 dark:border-white/10"
          >
            <h3 className="text-2xl font-semibold">{club.name}</h3>
            {club.description && (
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">{club.description}</p>
            )}
          </Link>

          {round && (
            <RoundProgress
              raised={raised}
              goal={BigInt(round.goal)}
              capMultiple={round.capMultiple}
              revenueBps={round.revenueBps}
              deadline={round.deadline}
              status={round.status}
            />
          )}
        </section>
      )}
    </div>
  );
}
