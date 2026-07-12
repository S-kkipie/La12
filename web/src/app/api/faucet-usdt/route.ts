import { NextResponse } from "next/server";
import { z } from "zod";
import { mintTestUsdt } from "@/lib/faucetUsdt";

const faucetUsdtSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// Same shape as /api/faucet: one mint per address per hour, in-memory. Resets
// on restart, not shared across instances — fine for a single-node demo.
const RATE_LIMIT_MS = 60 * 60 * 1000;
const lastMintedAt = new Map<string, number>();

export async function POST(request: Request) {
  const parsed = faucetUsdtSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const address = parsed.data.address.toLowerCase();
  const last = lastMintedAt.get(address);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return NextResponse.json({ error: "rate limited, try again later" }, { status: 429 });
  }

  const result = await mintTestUsdt(parsed.data.address as `0x${string}`);
  if ("skipped" in result) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }

  lastMintedAt.set(address, Date.now());
  return NextResponse.json({ hash: result.hash, amount: result.amount.toString() });
}
