import { AccountView } from "@daveyplate/better-auth-ui";
import { accountViewPaths } from "@daveyplate/better-auth-ui/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Account/settings screens rendered by better-auth-ui. Dynamic (per-user): we
// read the session server-side to gate access and bounce anonymous visitors to
// sign-in. We only expose the views our better-auth config actually supports
// (profile + security) — no teams/orgs/api-keys plugins are enabled.
const ALLOWED = new Set<string>([
  accountViewPaths.SETTINGS,
  accountViewPaths.SECURITY,
]);

export default async function AccountPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!ALLOWED.has(path)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/account/${path}`)}`);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <AccountView path={path} />
    </main>
  );
}
