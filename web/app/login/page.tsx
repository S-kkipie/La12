"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { ensureWalletLinked } from "@/lib/ensureWallet";
import { friendlyError } from "@/lib/txError";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const toastId = toast.loading("Ingresando…");
    try {
      const { data, error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error(error.message ?? "Email o contraseña incorrectos", { id: toastId });
        return;
      }

      // Self-heal: makes sure this device has a wallet for this account and
      // the server has its address, whether this is the device that created
      // the account or a fresh one recovering after an interrupted signup.
      toast.loading("Preparando tu billetera…", { id: toastId });
      await ensureWalletLinked(data.user.id);

      toast.success("¡Bienvenido!", { id: toastId });
      const next = searchParams.get("next");
      router.push(next ?? (data.user.role === "club" ? "/dashboard" : "/wallet"));
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Iniciá sesión</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
        />
        <input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        ¿No tenés cuenta?{" "}
        <a href="/signup" className="font-medium text-emerald-700 dark:text-emerald-400">
          Creá una
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams() opts this page into client-side rendering for that
  // part of the tree — Next requires a Suspense boundary around it so the
  // rest of the shell can still prerender.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
