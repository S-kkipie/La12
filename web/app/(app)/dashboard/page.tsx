import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { EnsureWallet } from "@/components/EnsureWallet";
import { ClubOverview } from "@/components/club/ClubOverview";

/**
 * Club-only home. Every gate here is server-side, not just hidden UI: no
 * session -> /auth/sign-in; session but role !== "club" -> /wallet (a fan can
 * never reach this page, and there's no club-only action anywhere that skips
 * this check — see also /api/rounds POST, which re-derives the club from the
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <EnsureWallet userId={session.user.id} hasWalletLinked={false} />
      </div>
    );
  }

  const usdtAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;

  return (
    <Suspense>
      <ClubOverview
        clubName={club.name}
        clubWalletAddress={club.walletAddress as `0x${string}`}
        usdtAddress={usdtAddress}
      />
    </Suspense>
  );
}
