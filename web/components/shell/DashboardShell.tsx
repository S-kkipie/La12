import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { Role } from "./nav-items";

export function DashboardShell({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar role={role} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} role={role} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
