import Link from "next/link";
import { listClubsWithRounds } from "@/lib/clubDirectory";
import { ClubCard } from "@/components/ClubCard";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ClubsPage() {
  const clubs = await listClubsWithRounds();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl uppercase tracking-wide">All clubs</h1>
        <p className="max-w-xl text-muted-foreground">
          Every club currently raising on La Doce, most-funded first.
        </p>
      </header>

      {clubs.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <ClubCard key={c.club.id} {...c} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No clubs yet — be the first.</p>
          <Link href="/auth/sign-up" className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
            List your club
          </Link>
        </div>
      )}
    </div>
  );
}
