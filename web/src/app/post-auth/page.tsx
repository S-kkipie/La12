import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";

// better-auth-ui's redirectTo is a single static path, so every successful
// sign-in / sign-up lands here. This server page reads the freshly-created
// session and routes by role. Wallet creation + linking still happens on the
// destination page via <EnsureWallet>.
export default async function PostAuthPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  redirect(session.user.role === "club" ? "/dashboard" : "/wallet");
}
