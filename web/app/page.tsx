import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { totalRaised, readSafely } from "@/lib/contracts";
import { RoundProgress } from "@/components/RoundProgress";

const FEATURED_SLUG = "deportivo-san-martin";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
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
        <span className="font-display text-lg uppercase tracking-widest text-primary">
          La Doce
        </span>
        <h1 className="font-display text-6xl uppercase leading-[0.95] tracking-wide">
          Sé socio de tu club, en USD₮.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Financiá la temporada de tu club y cobrá tu parte de la recaudación —
          sin banco, sin custodia, con tu propia billetera.
        </p>
        <Link
          href={session ? (session.user.role === "club" ? "/dashboard" : "/wallet") : "/signup"}
          className="w-fit rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {session ? (session.user.role === "club" ? "Ir a mi panel" : "Ir a mi billetera") : "Crear cuenta"}
        </Link>
      </header>

      {club && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Club destacado
          </h2>
          <Link
            href={`/club/${club.slug}`}
            className="block rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
          >
            <h3 className="font-display text-3xl uppercase tracking-wide">{club.name}</h3>
            {club.description && (
              <p className="mt-2 text-muted-foreground">{club.description}</p>
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
