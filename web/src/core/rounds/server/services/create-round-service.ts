import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";
import { insertRound } from "../repository/insert-round";
import type { Round, NewRound } from "@/db/schema";

type CreateRoundBody = {
  contractAddress: string;
  goal: string;
  sharePrice: string;
  revenueBps: number;
  capMultiple: number;
  deadline: Date;
};

type Club = { id: number; walletAddress: string };

type CreateRoundDeps = {
  club: Club;
  body: CreateRoundBody;
  readClub: (address: `0x${string}`) => Promise<string>;
  insertRound: (values: Omit<NewRound, "verified">) => Promise<Round>;
};

/**
 * `RoundFactory.createRound()` is permissionless — anyone can deploy a round
 * naming any address as `club`. So a session + role check alone isn't
 * enough: we also read the deployed round's own `club()` and require it to
 * match this account's registered wallet before trusting the submission
 * (and only then mark it `verified`). This is on top of, not instead of, the
 * role gate — a fan session never reaches this service (clubAuthed rejects
 * it before the route calls in). Moved verbatim from app/api/rounds POST.
 */
export async function createRound(deps: CreateRoundDeps): AsyncAppResult<Round> {
  const { club, body } = deps;

  let onChainClub: string;
  try {
    onChainClub = await deps.readClub(body.contractAddress as `0x${string}`);
  } catch {
    return err(AppErrors.invalidBody({ targets: ["contractAddress"] }));
  }

  if (onChainClub.toLowerCase() !== club.walletAddress.toLowerCase()) {
    return err(AppErrors.invalidBody({ targets: ["contractAddress"] }));
  }

  try {
    const round = await deps.insertRound({
      clubId: club.id,
      contractAddress: body.contractAddress,
      goal: body.goal,
      sharePrice: body.sharePrice,
      revenueBps: body.revenueBps,
      capMultiple: body.capMultiple,
      deadline: body.deadline,
    });
    return ok(round);
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function createRoundService(club: Club, body: CreateRoundBody): AsyncAppResult<Round> {
  return createRound({
    club,
    body,
    readClub: (address) =>
      publicClient.readContract({ address, abi: revenueShareRoundAbi, functionName: "club" }) as Promise<string>,
    insertRound,
  });
}
