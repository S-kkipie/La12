// Resolves the active viem chain from NEXT_PUBLIC_CHAIN_ID so the same code
// runs against a local anvil node (chainId 31337) or Sepolia. Writes via viem
// must carry the right chain or they revert on a chainId mismatch.
import { foundry, sepolia } from "viem/chains";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

/** viem chain object matching NEXT_PUBLIC_CHAIN_ID (anvil local vs Sepolia). */
export const activeChain = CHAIN_ID === foundry.id ? foundry : sepolia;
