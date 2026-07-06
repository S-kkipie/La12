"use client";

// Custom sign-up screen. better-auth-ui owns every other auth view, but its
// additionalFields only render text/number/boolean inputs — it can't render
// the club/fan enum as a proper segmented picker. So this one screen stays
// hand-rolled, restyled onto shadcn primitives + the design tokens, and it
// persists `role` to better-auth's existing `role` additionalField.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { friendlyError } from "@/lib/txError";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "club" | "fan";

export default function SignUpPage() {
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
      const { data, error } = await authClient.signUp.email({
        name,
        email,
        password,
        role,
      });
      if (error) {
        // signUp commits the account (+ signs it in) before we ever get to
        // wallet creation, so a retry after a dropped request lands here —
        // send them to log in instead of a dead-end error.
        if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
          toast.error("Ese email ya tiene cuenta — iniciá sesión", { id: toastId });
          router.push(`/auth/sign-in?email=${encodeURIComponent(email)}`);
          return;
        }
        toast.error(error.message ?? "No se pudo crear la cuenta", { id: toastId });
        return;
      }

      // Wallet creation + linking is NOT done here: /post-auth routes by role
      // to /wallet or /dashboard, and <EnsureWallet> on that page self-heals
      // the wallet (self-custody seed generated in-browser). `data` is used so
      // the success path stays tied to a real account.
      void data;
      toast.success("¡Cuenta creada!", { id: toastId });
      router.push("/post-auth");
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
      <Card className="glow w-full">
        <CardHeader>
          <CardTitle className="text-xl">Creá tu cuenta</CardTitle>
          <CardDescription>
            Sumate a La Doce como hincha o registrá tu club.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Tipo de cuenta</Label>
              <div
                role="radiogroup"
                aria-label="Tipo de cuenta"
                className="flex gap-1 rounded-lg border border-input p-1"
              >
                {(["fan", "club"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    onClick={() => setRole(r)}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      role === r
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r === "fan" ? "Soy hincha" : "Soy un club"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                {role === "club" ? "Nombre del club" : "Tu nombre"}
              </Label>
              <Input
                id="name"
                type="text"
                required
                placeholder={role === "club" ? "Nombre del club" : "Tu nombre"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="vos@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creando…" : "Crear cuenta"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <Link
              href="/auth/sign-in"
              className="font-medium text-primary hover:underline"
            >
              Iniciá sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
