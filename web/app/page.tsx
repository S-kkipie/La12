import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { ArrowRight, ShieldCheck, Repeat, TrendingUp, Trophy } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { totalRaised, readSafely } from "@/lib/contracts";
import { formatUsdt, formatBps, formatCapMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

const FEATURED_SLUG = "deportivo-san-martin";

// Illustrative market/club data for the landing — clearly example content, not
// on-chain reads (the featured card below IS a real verified round).
const LIVE_MARKET = [
  { name: "Sacachispas FC", change: "+12.4%", up: true },
  { name: "Almirante Brown", change: "-2.1%", up: false },
  { name: "Nueva Chicago", change: "+5.8%", up: true },
  { name: "Chacarita Jr.", change: "+22.1%", up: true },
];

const EXAMPLE_CLUBS = [
  { name: "Atlético El Porvenir", crest: "/crest-porvenir.jpg", tag: "Revenue share 12%", funded: 82 },
  { name: "Racing del Norte", crest: null, tag: "Cap 2.0×", funded: 60 },
  { name: "Estrella Roja FC", crest: null, tag: "Revenue share 9%", funded: 45 },
];

function compactUsd(baseUnits: bigint): string {
  const whole = Number(baseUnits / 1_000000n);
  if (whole >= 1000) {
    const k = whole / 1000;
    return `$${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${whole}`;
}

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

  const goal = round ? BigInt(round.goal) : 40_000_000000n;
  const pct = goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
  const investHref = session
    ? session.user.role === "club"
      ? "/dashboard"
      : "/wallet"
    : "/auth/sign-up";

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-24 md:py-32">
          <span className="w-fit rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Decentralized finance · Football
          </span>
          <h1 className="max-w-4xl font-display text-6xl uppercase leading-[0.92] tracking-wide md:text-8xl">
            Own a piece of your club, in <span className="text-primary">USD₮</span>.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            The passion isn&apos;t for sale — but now it pays off. Back your club&apos;s season and
            take your cut of the revenue, straight to your self-custody wallet. No bank, no
            middleman, no custody.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={investHref} className={buttonVariants({ size: "lg" })}>
              Start investing <ArrowRight className="ml-1 size-4" />
            </Link>
            <Link href="#clubs" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Browse clubs
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured clubs ──────────────────────────────────── */}
      <section id="clubs" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wide md:text-4xl">
            Featured clubs
          </h2>
          <Link href="#clubs" className="text-sm font-medium text-primary hover:underline">
            View all teams →
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Real verified round, dressed as the hero club card */}
          <div className="glow relative overflow-hidden rounded-lg border border-border lg:col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stadium.jpg"
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-[1.8] object-cover object-[center_78%] opacity-40"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/45" />
            <div className="relative flex flex-col gap-5 p-6 md:p-8">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-lg border border-primary/40 bg-background/60 font-display text-2xl text-primary">
                  {(club?.name ?? "SM").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-display text-3xl uppercase tracking-wide">
                    {club?.name ?? "Deportivo San Martín"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Next big transfer · 75% probability
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "Revenue share", v: round ? formatBps(round.revenueBps) : "8.0%" },
                  { k: "Cap", v: round ? formatCapMultiple(round.capMultiple) : "1.50×" },
                  { k: "Token price", v: "$1.00" },
                  { k: "Goal", v: compactUsd(goal) },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.k}
                    </div>
                    <div className="font-display text-2xl tracking-wide text-primary">{s.v}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Funding progress</span>
                  <span>{pct}% funded</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-display text-xl tracking-wide">{formatUsdt(raised)}</span>{" "}
                  <span className="text-muted-foreground">/ {formatUsdt(goal)} USD₮ raised</span>
                </div>
              </div>

              <p className="max-w-lg text-sm text-muted-foreground">
                Neighborhood club with die-hard support. La Doce funds next season in exchange for a
                slice of gate revenue — paid pro-rata to token holders, on-chain.
              </p>

              <Link
                href={club ? `/club/${club.slug}` : investHref}
                className={cn(buttonVariants({ size: "lg" }), "w-fit")}
              >
                Invest now
              </Link>
            </div>
          </div>

          {/* Side column: live market + directors CTA */}
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <TrendingUp className="size-4 text-primary" /> Live market
              </div>
              <ul className="flex flex-col gap-3 text-sm">
                {LIVE_MARKET.map((m) => (
                  <li key={m.name} className="flex items-center justify-between">
                    <span>{m.name}</span>
                    <span className={m.up ? "text-primary" : "text-destructive"}>{m.change}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="#clubs"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full")}
              >
                Open the market
              </Link>
            </div>

            <div className="glow rounded-lg bg-primary p-5 text-primary-foreground">
              <div className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide">
                <Trophy className="size-5" /> Club director?
              </div>
              <p className="mt-2 text-sm text-primary-foreground/80">
                Take your club to the next financial level with blockchain — no bank, no gatekeepers.
              </p>
              <Link
                href="/auth/sign-up"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "mt-4 bg-background text-foreground hover:bg-background/90",
                )}
              >
                List your club
              </Link>
            </div>
          </div>
        </div>

        {/* Example teams raising now */}
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {EXAMPLE_CLUBS.map((c) => (
            <div key={c.name} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                {c.crest ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.crest} alt="" className="size-11 rounded-lg object-cover" />
                ) : (
                  <div className="flex size-11 items-center justify-center rounded-lg border border-primary/40 bg-background font-display text-lg text-primary">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-display text-lg uppercase tracking-wide">{c.name}</div>
                  <div className="text-xs text-primary">{c.tag}</div>
                </div>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${c.funded}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{c.funded}% funded</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why La Doce ─────────────────────────────────────── */}
      <section id="why" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-center font-display text-4xl uppercase tracking-wide md:text-5xl">
          Why La Doce?
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Transparency",
              body: "Every USD₮ is tracked on-chain. You see exactly where the money goes — no fine print, no black box.",
            },
            {
              icon: Repeat,
              title: "Withdraw anytime",
              body: "Your tokens are liquid. Trade your stake on the secondary market whenever you want. Your capital, your call.",
            },
            {
              icon: TrendingUp,
              title: "Owners of the future",
              body: "Invest in the academy. Earn when a homegrown kid gets sold to Europe. Sporting and financial upside.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-card p-6">
              <div className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <c.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="glow flex flex-col items-center gap-5 rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground">
          <h2 className="font-display text-5xl uppercase tracking-wide md:text-6xl">
            The match already started.
          </h2>
          <p className="max-w-xl text-primary-foreground/80">
            Don&apos;t watch from the stands. Create your wallet in under 2 minutes and start
            building your club&apos;s future.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={investHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-background text-foreground hover:bg-background/90",
              )}
            >
              Create my wallet
            </Link>
            <Link
              href="#why"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10",
              )}
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="font-display text-2xl uppercase tracking-wide text-primary">La Doce</div>
            <p className="mt-2 text-sm text-muted-foreground">The number 12 is you.</p>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Protocol
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="#clubs" className="hover:text-primary">Featured clubs</Link></li>
              <li><Link href="#why" className="hover:text-primary">How it works</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/auth/sign-in" className="hover:text-primary">Sign in</Link></li>
              <li><Link href="/auth/sign-up" className="hover:text-primary">Sign up</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Newsletter
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="you@email.com"
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-primary"
              />
              <Button size="sm">→</Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-4 text-xs text-muted-foreground">
            © 2026 La Doce Protocol · Built on Tether WDK + Ethereum
          </div>
        </div>
      </footer>
    </div>
  );
}
