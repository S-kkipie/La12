"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { navItemsFor, ctaFor, type Role } from "./nav-items";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  const cta = ctaFor(role);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="px-2 font-display text-2xl uppercase tracking-wide text-primary">
        La Doce
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = item.href === "/wallet" || item.href === "/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.href !== "/";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2">
        <Link href={cta.href} className={cn(buttonVariants(), "w-full")}>
          {cta.label}
        </Link>
        <Link
          href="/account/settings"
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <LifeBuoy className="size-4" />
          Support
        </Link>
      </div>
    </div>
  );
}
