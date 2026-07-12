import assert from "node:assert";
import { shortenAddress, formatRelativeTime, explorerTxUrl } from "./format";

// shortenAddress
assert.equal(shortenAddress("0x1234567890abcdef1234567890abcdefdeadbeef"), "0x1234…beef");
assert.equal(shortenAddress("0x1234567890abcdef1234567890abcdefdeadbeef", 6), "0x123456…adbeef");
assert.equal(shortenAddress(""), ""); // tolerate empty

// formatRelativeTime — pin "now" so the test is deterministic
const now = 1_000_000_000_000; // ms
assert.equal(formatRelativeTime(1_000_000_000, now), "just now"); // 0s ago
assert.equal(formatRelativeTime(1_000_000_000 - 300, now), "5m ago");
assert.equal(formatRelativeTime(1_000_000_000 - 3 * 3600, now), "3h ago");
assert.equal(formatRelativeTime(1_000_000_000 - 2 * 86_400, now), "2d ago");

// explorerTxUrl — contains the hash and a /tx/ segment (or "#")
const url = explorerTxUrl("0xabc");
assert.ok(url === "#" || url.includes("/tx/0xabc"));

console.log("format helpers OK");
