"use client";

import Link from "next/link";
import { useSession } from "@/frontend/auth/auth";
import { buttonVariants } from "@/components/ui/button";
import { AccountMenu } from "@/components/shell/AccountMenu";

export function Navbar() {
  const { data: session, isPending } = useSession();

  return (
    <nav className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="font-display text-2xl uppercase tracking-wide text-primary">
        La Doce
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {isPending ? null : session ? (
          <AccountMenu />
        ) : (
          <>
            <Link href="/auth/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/auth/sign-up" className={buttonVariants({ size: "sm" })}>
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
