import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { totalRaised, readSafely } from "@/lib/contracts";
import { RoundProgress } from "@/components/RoundProgress";
import { DistributeForm } from "@/components/DistributeForm";
import { CreateRoundForm } from "@/components/CreateRoundForm";
import { EnsureWallet } from "@/components/EnsureWallet";

/**
 * Club-only home. Every gate here is server-side, not just hidden UI: no
 * session -> /login; session but role !== "club" -> /wallet (a fan can never
 * reach this page, and there's no club-only action anywhere that skips this
 * check — see also /api/rounds POST, which re-derives the club from the
 * session rather than trusting anything the client sends).
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "club") redirect("/wallet");

  const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
  if (!club) {
    // Self-heal an interrupted signup (see lib/ensureWallet.ts): create+link
    // this account's wallet, then refresh so `club` resolves above.
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-16">
        <EnsureWallet userId={session.user.id} hasWalletLinked={false} />
      </div>
    );
  }

  const clubRounds = await db.select().from(rounds).where(eq(rounds.clubId, club.id));
  const roundsWithRaised = await Promise.all(
    clubRounds.map(async (round) => ({
      round,
      raised: await readSafely(() => totalRaised(round.contractAddress as `0x${string}`), 0n),
    })),
  );

  const usdtAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <span className="font-display text-lg uppercase tracking-widest text-primary">
          Panel del club
        </span>
        <h1 className="font-display text-5xl uppercase tracking-wide">{club.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{club.walletAddress}</p>
      </header>

      {usdtAddress ? (
        <CreateRoundForm
          clubName={club.name}
          clubWalletAddress={club.walletAddress as `0x${string}`}
          usdtAddress={usdtAddress}
        />
      ) : (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Falta configurar NEXT_PUBLIC_USDT_ADDRESS para crear rondas.
        </p>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tus rondas</h2>
        {roundsWithRaised.length === 0 && (
          <p className="text-muted-foreground">Todavía no creaste una ronda.</p>
        )}
        {roundsWithRaised.map(({ round, raised }) => (
          <div key={round.id} className="flex flex-col gap-3">
            <RoundProgress
              raised={raised}
              goal={BigInt(round.goal)}
              capMultiple={round.capMultiple}
              revenueBps={round.revenueBps}
              deadline={round.deadline}
              status={round.status}
            />
            <DistributeForm roundAddress={round.contractAddress as `0x${string}`} />
          </div>
        ))}
      </section>
    </div>
  );
}
