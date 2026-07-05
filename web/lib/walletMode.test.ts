// web/lib/walletMode.test.ts
import assert from "node:assert";
import { walletMode } from "./walletMode";

process.env.NEXT_PUBLIC_WALLET_MODE = "erc4337";
assert.equal(walletMode(), "erc4337");
delete process.env.NEXT_PUBLIC_WALLET_MODE;
assert.equal(walletMode(), "standard"); // default
console.log("walletMode OK");
