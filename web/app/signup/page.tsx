"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { createWallet } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";

type Role = "club" | "fan";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("fan");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const toastId = toast.loading("Creando cuenta…");
    try {
      const { error } = await authClient.signUp.email({ name, email, password, role });
      if (error) {
        toast.error(error.message ?? "No se pudo crear la cuenta", { id: toastId });
        return;
      }

      // Self-custody: the seed never leaves the browser — only the public
      // address gets linked to the account.
      toast.loading("Creando tu billetera…", { id: toastId });
      const { address } = await createWallet();

      const res = await fetch("/api/account/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo vincular la billetera", { id: toastId });
        return;
      }

      toast.success("¡Cuenta creada!", { id: toastId });
      router.push(role === "club" ? "/dashboard" : "/wallet");
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Creá tu cuenta</h1>

      <div className="flex rounded-full border border-black/10 p-1 dark:border-white/10">
        {(["fan", "club"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              role === r
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {r === "fan" ? "Soy hincha" : "Soy un club"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          placeholder={role === "club" ? "Nombre del club" : "Tu nombre"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
        />
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
          minLength={8}
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
          {submitting ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        ¿Ya tenés cuenta?{" "}
        <a href="/login" className="font-medium text-emerald-700 dark:text-emerald-400">
          Iniciá sesión
        </a>
      </p>
    </div>
  );
}
