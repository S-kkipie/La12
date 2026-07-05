// Wallet-mode config: "standard" (EOA, ETH gas — local anvil demo) vs
// "erc4337" (Safe smart account, gas paid in USD₮ via a paymaster — testnet/
// mainnet). One responsibility: read+validate the env, nothing else. See
// docs/superpowers/plans/2026-07-05-erc4337-gasless-mainnet.md.
export type WalletMode = "standard" | "erc4337";

export function walletMode(): WalletMode {
  return process.env.NEXT_PUBLIC_WALLET_MODE === "erc4337" ? "erc4337" : "standard";
}

export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ??
  "0x0000000000000000000000000000000000dEaD") as `0x${string}`; // TODO(wire): real mock USD₮ address on Sepolia (spec §9)

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} requerido en modo erc4337`);
  return v;
}

export function erc4337Config() {
  return {
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111),
    provider: process.env.NEXT_PUBLIC_RPC_URL ?? required("NEXT_PUBLIC_RPC_URL"),
    bundlerUrl: required("NEXT_PUBLIC_BUNDLER_URL"),
    paymasterUrl: required("NEXT_PUBLIC_PAYMASTER_URL"),
    paymasterAddress: required("NEXT_PUBLIC_PAYMASTER_ADDRESS") as `0x${string}`,
    safeModulesVersion: process.env.NEXT_PUBLIC_SAFE_MODULES_VERSION ?? "0.3.0",
    paymasterToken: { address: USDT_ADDRESS },
  };
}
