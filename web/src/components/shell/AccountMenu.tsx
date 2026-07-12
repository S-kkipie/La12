"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/frontend/auth/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AccountMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending || !session) return null;

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  const home = session.user.role === "club" ? "/dashboard" : "/wallet";

  return (
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
        <DropdownMenuItem render={<Link href="/account/settings" />}>Account</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
