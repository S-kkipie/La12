"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";

function fmtDate(ts: number): string {
  return ts ? new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export function RevenueChart({ points }: { points: { ts: number; usdt: number }[] }) {
  return (
    <Card className="glow gap-3 p-5">
      <h2 className="font-display text-xl uppercase tracking-wide">Revenue distributed</h2>
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No distributions yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="ts" tickFormatter={fmtDate} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              formatter={(v) => [`${Number(v).toLocaleString("en-US")} USD₮`, "Cumulative"]}
              labelFormatter={(label) => fmtDate(Number(label))}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
            />
            <Area type="monotone" dataKey="usdt" stroke="var(--primary)" strokeWidth={2} fill="url(#revfill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
