// Wallet-mode config: "standard" (EOA, ETH gas — local anvil demo) vs
// "erc4337" (Safe smart account, gas paid in USD₮ via a paymaster — testnet/
// mainnet). One responsibility: read+validate the env, nothing else. See
// docs/superpowers/plans/2026-07-05-erc4337-gasless-mainnet.md.
export type WalletMode = "standard" | "erc4337";

export function walletMode(): WalletMode {
  return process.env.NEXT_PUBLIC_WALLET_MODE === "erc4337" ? "erc4337" : "standard";
}

// Single source of truth for the USD₮ token address. Undefined when unset —
// no fake fallback address: code that needs it calls `requireUsdt()` and fails
// loud, instead of silently pointing transfers/paymaster at a dead address.
// (NEXT_PUBLIC_* must be a literal member access to be inlined into the client
// bundle by Next.js; `process.env[name]` with a dynamic key reads empty there.)
export const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as
  | `0x${string}`
  | undefined;

/** USD₮ address, or throw — use wherever a real token address is required. */
export function requireUsdt(): `0x${string}` {
  if (!USDT_ADDRESS) {
    throw new Error(
      "NEXT_PUBLIC_USDT_ADDRESS no configurado (requerido para transferencias / paymaster USD₮)",
    );
  }
  return USDT_ADDRESS;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} requerido en modo erc4337`);
  return value;
}

export function erc4337Config() {
  return {
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111),
    provider: required("NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL),
    bundlerUrl: required("NEXT_PUBLIC_BUNDLER_URL", process.env.NEXT_PUBLIC_BUNDLER_URL),
    paymasterUrl: required("NEXT_PUBLIC_PAYMASTER_URL", process.env.NEXT_PUBLIC_PAYMASTER_URL),
    paymasterAddress: required(
      "NEXT_PUBLIC_PAYMASTER_ADDRESS",
      process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS
    ) as `0x${string}`,
    safeModulesVersion: process.env.NEXT_PUBLIC_SAFE_MODULES_VERSION ?? "0.3.0",
    paymasterToken: { address: requireUsdt() },
  };
}
