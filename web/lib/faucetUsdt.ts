// MockUSDT test faucet — mints test USD₮ into a fan's wallet so the
// invest→claim loop is clickable with zero real money. Only meaningful
// against MockUSDT.sol (local anvil or a testnet deploy): its `mint()` is
// public/unrestricted by design (it's the faucet token, not real USD₮).
// Mirrors lib/sponsor.ts's relayer pattern — same server-only key, never the
// fan's own.
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "./chain";
import mockUsdtAbi from "../../packages/abi/MockUSDT.json";

const RPC_URL =
  process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

// Default: 5,000 USD₮ (6 decimals) — enough for a handful of demo invests.
const FAUCET_AMOUNT = BigInt(process.env.FAUCET_USDT_AMOUNT ?? "5000000000");

export type FaucetUsdtResult =
  | { hash: `0x${string}`; amount: bigint }
  | { skipped: true; reason: string };

/** Mints `FAUCET_USDT_AMOUNT` of MockUSDT to `recipient`. */
export async function mintTestUsdt(recipient: `0x${string}`): Promise<FaucetUsdtResult> {
  const pk = process.env.SPONSOR_PK;
  const usdtAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS;
  if (!pk || !usdtAddress) {
    // No-op cleanly rather than throwing — same reasoning as sponsor.ts: lets
    // the app build/run without a configured relayer or USD₮ address.
    return {
      skipped: true,
      reason:
        "SPONSOR_PK o NEXT_PUBLIC_USDT_ADDRESS no configurados — faucet de USD₮ de prueba deshabilitado.",
    };
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: activeChain, transport: http(RPC_URL) });

  const hash = await walletClient.writeContract({
    address: usdtAddress as `0x${string}`,
    abi: mockUsdtAbi,
    functionName: "mint",
    args: [recipient, FAUCET_AMOUNT],
    chain: activeChain,
  });

  return { hash, amount: FAUCET_AMOUNT };
}
