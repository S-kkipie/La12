import Link from "next/link";
import { ActivityList } from "./ActivityList";
import type { HistoryEntryView } from "./types";
import { Card } from "@/components/ui/card";

export function ActivityPanel({ entries }: { entries: HistoryEntryView[] }) {
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl uppercase tracking-wide">Activity</h2>
      </div>
      <ActivityList entries={entries.slice(0, 5)} />
      {entries.length > 0 && (
        <Link href="/wallet/activity" className="text-sm font-medium text-primary hover:underline">
          View full ledger →
        </Link>
      )}
    </Card>
  );
}
