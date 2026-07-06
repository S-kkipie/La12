"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  const home = session ? (session.user.role === "club" ? "/dashboard" : "/wallet") : "/";

  return (
    <nav className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link
        href="/"
        className="font-display text-2xl uppercase tracking-wide text-primary"
      >
        La Doce
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {isPending ? null : session ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="size-9 border border-border">
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={home} />}>
                {session.user.role === "club" ? "Dashboard" : "My wallet"}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/account/settings" />}>
                Account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Link
              href="/auth/sign-in"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
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
