import { redirect } from "next/navigation";

// Legacy path — auth now lives under /auth/*. Kept as a redirect stub so old
// links / bookmarks still work.
export default function SignupRedirect() {
  redirect("/auth/sign-up");
}
