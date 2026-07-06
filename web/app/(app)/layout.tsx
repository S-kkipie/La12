import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/shell/DashboardShell";
import type { Role } from "@/components/shell/nav-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Reads the session ONLY to pick which nav (fan/club) to render — this
  // layout does not gate access. Every page under (app) must keep its own
  // auth `redirect` check; an unauthenticated user reaching a page here would
  // still see the shell (with the fallback "fan" role) but no protected data.
  const session = await auth.api.getSession({ headers: await headers() });
  const role: Role = session?.user.role === "club" ? "club" : "fan";
  const title = role === "club" ? "Dashboard" : "Wallet";
  return (
    <DashboardShell role={role} title={title}>
      {children}
    </DashboardShell>
  );
}
