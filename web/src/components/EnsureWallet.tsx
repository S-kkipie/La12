"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEnsureWallet } from "@/core/account/client/use-ensure-wallet";
import { friendlyError } from "@/lib/txError";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  userId: string;
  /** Server already found a clubs/profiles row with a wallet for this user. */
  hasWalletLinked: boolean;
};

/**
 * Self-heal for an interrupted signup/login (bug: signUp commits the account
 * before the wallet gets linked, so a dropped request can otherwise leave a
 * user stuck with no wallet). If the page tells us this account has no
 * linked wallet yet, create+link one and refresh so the server data catches up.
 */
export function EnsureWallet({ userId, hasWalletLinked }: Props) {
  const router = useRouter();
  const ensureWallet = useEnsureWallet();
  const [healing, setHealing] = useState(!hasWalletLinked);
  const ran = useRef(false);

  useEffect(() => {
    if (hasWalletLinked || ran.current) return;
    ran.current = true;

    ensureWallet(userId)
      .then(() => router.refresh())
      .catch((err) => toast.error(friendlyError(err)))
      .finally(() => setHealing(false));
    // ensureWallet closes over a stable mutation; the run-once ref guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWalletLinked, router, userId]);

  if (!hasWalletLinked && healing) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Skeleton className="size-4 rounded-full" />
        Setting up your wallet…
      </div>
    );
  }
  return null;
}
