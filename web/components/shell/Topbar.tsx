import { AccountMenu } from "./AccountMenu";
import { WalletModeChip } from "./WalletModeChip";
import { MobileNav } from "./MobileNav";
import type { Role } from "./nav-items";

export function Topbar({ title, role }: { title: string; role: Role }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <MobileNav role={role} />
        <h1 className="font-display text-xl uppercase tracking-wide">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <WalletModeChip />
        <AccountMenu />
      </div>
    </header>
  );
}
