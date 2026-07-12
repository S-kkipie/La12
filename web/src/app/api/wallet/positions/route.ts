import { NextResponse } from "next/server";
import { getFanPositions, toPositionDTO } from "@/lib/positions";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const positions = await getFanPositions(address as `0x${string}`);
    return NextResponse.json({ positions: positions.map(toPositionDTO) });
  } catch {
    // No verified rounds / DB hiccup: empty, not a 500 — the page still renders.
    return NextResponse.json({ positions: [] });
  }
}
