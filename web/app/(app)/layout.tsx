import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/shell/DashboardShell";
import type { Role } from "@/components/shell/nav-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const role: Role = session?.user.role === "club" ? "club" : "fan";
  const title = role === "club" ? "Dashboard" : "Wallet";
  return (
    <DashboardShell role={role} title={title}>
      {children}
    </DashboardShell>
  );
}
