import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, profiles, rounds } from "@/db/schema";
import { WalletCard } from "@/components/WalletCard";
import { ClaimButton } from "@/components/ClaimButton";
import { EnsureWallet } from "@/components/EnsureWallet";

export default async function WalletPage() {
  // Both roles can hold a wallet (a club needs USD₮ in theirs before
  // distribute() can pull from it) — any authenticated session is enough
  // here, unlike /dashboard which is club-only.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Self-heal an interrupted signup/login (see lib/ensureWallet.ts): if this
  // account has no linked wallet row yet, EnsureWallet creates + links one.
  const hasWalletLinked =
    session.user.role === "club"
      ? (await db.select().from(clubs).where(eq(clubs.userId, session.user.id))).length > 0
      : (await db.select().from(profiles).where(eq(profiles.userId, session.user.id))).length > 0;

  // Demo has a single seeded round; a fan with positions in several rounds
  // would see one ClaimButton per round here. Verified-only, same reasoning
  // as the other pages (schema.ts) — never point a claim at an unvetted round.
  const [round] = await db.select().from(rounds).where(eq(rounds.verified, true)).limit(1);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Tu billetera</h1>
      <EnsureWallet userId={session.user.id} hasWalletLinked={hasWalletLinked} />
      <WalletCard />
      {round && <ClaimButton roundAddress={round.contractAddress as `0x${string}`} />}
    </div>
  );
}
