import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, profiles } from "@/db/schema";
import { EnsureWallet } from "@/components/EnsureWallet";
import { WalletOverview } from "@/components/wallet/WalletOverview";

export default async function WalletPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const hasWalletLinked =
    session.user.role === "club"
      ? (await db.select().from(clubs).where(eq(clubs.userId, session.user.id))).length > 0
      : (await db.select().from(profiles).where(eq(profiles.userId, session.user.id))).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <EnsureWallet userId={session.user.id} hasWalletLinked={hasWalletLinked} />
      <Suspense>
        <WalletOverview />
      </Suspense>
    </div>
  );
}
