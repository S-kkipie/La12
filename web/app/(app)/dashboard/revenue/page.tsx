import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { RevenueDetail } from "@/components/club/RevenueDetail";

export default async function RevenuePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "club") redirect("/wallet");
  return <RevenueDetail />;
}
