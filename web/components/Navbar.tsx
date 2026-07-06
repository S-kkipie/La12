"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";

export function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
        La Doce
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {isPending ? null : session ? (
          <>
            <Link href={session.user.role === "club" ? "/dashboard" : "/wallet"}>
              {session.user.role === "club" ? "Mi panel" : "Mi billetera"}
            </Link>
            <Link href="/account/settings">Mi cuenta</Link>
            <button
              onClick={handleLogout}
              className="text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Salir
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/sign-in">Iniciar sesión</Link>
            <Link
              href="/auth/sign-up"
              className="rounded-full bg-emerald-600 px-4 py-1.5 font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Crear cuenta
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
