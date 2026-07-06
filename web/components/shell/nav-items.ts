import { LayoutGrid, Compass, ReceiptText, Settings, Wallet, TrendingUp, type LucideIcon } from "lucide-react";

export type Role = "club" | "fan";
export type NavItem = { href: string; label: string; icon: LucideIcon };

const FAN_ITEMS: NavItem[] = [
  { href: "/wallet", label: "Overview", icon: LayoutGrid },
  { href: "/", label: "Explore clubs", icon: Compass },
  { href: "/wallet/activity", label: "Activity", icon: ReceiptText },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

const CLUB_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

export function navItemsFor(role: Role): NavItem[] {
  return role === "club" ? CLUB_ITEMS : FAN_ITEMS;
}

export function ctaFor(role: Role): { label: string; href: string } {
  return role === "club"
    ? { label: "New round", href: "/dashboard?action=newRound" }
    : { label: "Add funds", href: "/wallet?action=addFunds" };
}
