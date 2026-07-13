import Link from "next/link";
import { formatBps } from "@/lib/format";
import type { ClubWithRound } from "@/core/directory/domain/types";

export function ClubCard({ club, round, pct }: ClubWithRound) {
  return (
    <Link
      href={`/club/${club.slug}`}
      className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt="" className="size-11 rounded-lg object-cover" />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-lg border border-primary/40 bg-background font-display text-lg text-primary">
            {club.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-display text-lg uppercase tracking-wide">{club.name}</div>
          <div className="text-xs text-primary">{formatBps(round.revenueBps)} revenue share</div>
        </div>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{pct}% funded</div>
    </Link>
  );
}
