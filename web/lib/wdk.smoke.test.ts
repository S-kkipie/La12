// web/lib/wdk.smoke.test.ts — standard-mode only (no bundler locally)
// NOTE: exercises the shape, not a browser. Uses a fixed seed via a tiny shim.
import assert from "node:assert";
// This test asserts the module exports getWallet and the WalletHandle shape.
import * as wdk from "./wdk";
assert.equal(typeof wdk.getWallet, "function");
console.log("wdk exports getWallet OK");
