import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import { WalletCard } from "@/components/WalletCard";
import { ClaimButton } from "@/components/ClaimButton";

export default async function WalletPage() {
  // Demo has a single seeded round; a fan with positions in several rounds
  // would see one ClaimButton per round here. Verified-only, same reasoning
  // as the other pages (schema.ts) — never point a claim at an unvetted round.
  const [round] = await db.select().from(rounds).where(eq(rounds.verified, true)).limit(1);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Tu billetera</h1>
      <WalletCard />
      {round && <ClaimButton roundAddress={round.contractAddress as `0x${string}`} />}
    </div>
  );
}
