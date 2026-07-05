import { NextResponse } from "next/server";
import { z } from "zod";
import { fundGas } from "@/lib/sponsor";

const faucetSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

// In-memory rate limit: one gas top-up per address per hour. Resets on
// server restart and isn't shared across instances — fine for a single-node
// hackathon demo; swap for a real store (Redis/DB) before scaling out.
const RATE_LIMIT_MS = 60 * 60 * 1000;
const lastFundedAt = new Map<string, number>();

export async function POST(request: Request) {
  const parsed = faucetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const address = parsed.data.address.toLowerCase();
  const last = lastFundedAt.get(address);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return NextResponse.json({ error: "rate limited, try again later" }, { status: 429 });
  }

  const result = await fundGas(parsed.data.address as `0x${string}`);
  if ("skipped" in result) {
    return NextResponse.json({ error: result.reason }, { status: 503 });
  }

  lastFundedAt.set(address, Date.now());
  return NextResponse.json(result);
}
