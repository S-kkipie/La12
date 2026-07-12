import { NextResponse } from "next/server";
import { z } from "zod";
import { buildOnRampSession } from "@/lib/moonpay";

const moonpaySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountUsd: z.number().positive(),
});

export async function POST(request: Request) {
  const parsed = moonpaySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = await buildOnRampSession(
    parsed.data.address as `0x${string}`,
    parsed.data.amountUsd,
  );
  return NextResponse.json(session);
}
