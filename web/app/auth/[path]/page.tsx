import { AuthView } from "@daveyplate/better-auth-ui";
import { authViewPaths } from "@daveyplate/better-auth-ui/server";

// Only the paths returned here are served by this catch-all. "sign-up" is
// intentionally excluded: our custom role-picker page at app/auth/sign-up
// (a static segment) owns that route and takes priority over this [path].
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths)
    .filter((path) => path !== authViewPaths.SIGN_UP)
    .map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center p-6">
      <AuthView path={path} />
    </main>
  );
}
