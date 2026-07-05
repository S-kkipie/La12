import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@tetherto/wdk",
    "@tetherto/wdk-wallet-evm",
    "@tetherto/wdk-wallet-evm-erc-4337", // depends on wdk-wallet-evm -> same sodium-native chain
    "sodium-native",
    "sodium-universal",
    "bare-node-runtime",
  ],
};

export default nextConfig;
