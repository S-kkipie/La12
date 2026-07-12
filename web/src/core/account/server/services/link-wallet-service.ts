import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { upsertClubWallet } from "../repository/upsert-club-wallet";
import { upsertProfileWallet } from "../repository/upsert-profile-wallet";
import type { LinkedWallet } from "@/core/account/domain/types";

type SessionUser = { id: string; role: "club" | "fan"; name: string };

/** Deps injected so the branch logic is testable without a DB. */
type LinkWalletDeps = {
  user: SessionUser;
  walletAddress: string;
  upsertClub: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
  upsertProfile: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
};

/** Upsert the caller's club/profile row by role, normalized to a LinkedWallet DTO. */
export async function linkWallet(deps: LinkWalletDeps): AsyncAppResult<LinkedWallet> {
  try {
    const { user, walletAddress } = deps;
    const { id } =
      user.role === "club"
        ? await deps.upsertClub(user.id, user.name, walletAddress)
        : await deps.upsertProfile(user.id, user.name, walletAddress);
    return ok({ role: user.role, walletAddress, linkedId: id });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function linkWalletService(
  user: SessionUser,
  body: { walletAddress: string },
): AsyncAppResult<LinkedWallet> {
  return linkWallet({
    user,
    walletAddress: body.walletAddress,
    upsertClub: upsertClubWallet,
    upsertProfile: upsertProfileWallet,
  });
}
