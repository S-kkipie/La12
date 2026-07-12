import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { ActivityFull } from "@/components/wallet/ActivityFull";

export default async function ActivityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  return <ActivityFull />;
}
