import { NextResponse } from "next/server";
import { getHistory, type HistoryEntry } from "@/lib/indexer";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// bigints can't go through JSON — stringify amount/blockNumber for the client.
function toDTO(e: HistoryEntry) {
  return { ...e, amount: e.amount.toString(), blockNumber: e.blockNumber.toString() };
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const entries = await getHistory(address as `0x${string}`);
    return NextResponse.json({ entries: entries.map(toDTO) });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
