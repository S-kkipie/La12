import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatUsdt, shortenAddress, formatRelativeTime, explorerTxUrl } from "@/lib/format";
import type { HistoryEntry } from "@/core/wallet/domain/types";

export function ActivityList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground">No activity yet.</div>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {entries.map((e) => (
        <li key={e.hash} className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary">
              {e.kind === "in" ? <ArrowDownLeft className="size-4 text-primary" /> : <ArrowUpRight className="size-4" />}
            </span>
            <div>
              <div className="text-sm">{e.kind === "in" ? "Received" : "Sent"}</div>
              <a
                href={explorerTxUrl(e.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {shortenAddress(e.counterparty)} · {e.timestamp ? formatRelativeTime(e.timestamp) : ""}
              </a>
            </div>
          </div>
          <span className={`font-mono text-sm ${e.kind === "in" ? "text-primary" : ""}`}>
            {e.kind === "in" ? "+" : "−"}{formatUsdt(e.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
