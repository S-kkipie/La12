// Seeds one demo club + one demo round so a judge opens the app to zero
// friction (spec §6). Run with `pnpm db:seed`.
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const slug = "deportivo-san-martin";

  let [club] = await db.select().from(clubs).where(eq(clubs.slug, slug));
  if (!club) {
    [club] = await db
      .insert(clubs)
      .values({
        name: "Deportivo San Martín",
        slug,
        logoUrl: "/clubs/deportivo-san-martin.svg",
        description:
          "Club de barrio con hinchada de fierro. La Doce financia la próxima temporada a cambio de un porcentaje de la recaudación.",
        // TODO(wire): replace with the club's real WDK-derived payout wallet once onboarded.
        walletAddress: "0x00000000000000000000000000000000000000C1",
      })
      .returning();
    console.log("seeded club:", club.slug);
  } else {
    console.log("club already present:", club.slug);
  }

  const existingRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.clubId, club.id));

  if (existingRounds.length === 0) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);

    const [round] = await db
      .insert(rounds)
      .values({
        clubId: club.id,
        // TODO(wire): replace with the real RevenueShareRound address once RoundFactory deploys it.
        contractAddress: "0x00000000000000000000000000000000000000D3",
        goal: "50000000000", // 50,000 USD₮ (6 decimals)
        sharePrice: "1000000", // 1 USD₮ per share
        revenueBps: 800, // 8% retained by the round
        capMultiple: 15000, // 1.5x (bps-scaled, matches the contract's BPS_DENOM = 10_000)
        deadline,
        status: "funding",
        // Trusted: this is the one round we vet by hand for the demo (see
        // schema.ts — RoundFactory.createRound() is permissionless on-chain).
        verified: true,
      })
      .returning();
    console.log("seeded round:", round.id, "for club", club.slug);
  } else {
    console.log("round already present for club:", club.slug);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
