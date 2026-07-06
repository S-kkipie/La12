import assert from "node:assert";
import { mapIndexerTransfers, mapTransferLogs, dedupeEntries, type HistoryEntry } from "./indexer";

const SELF = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

// --- Indexer payload mapping (tolerant of field-name variants) ---
const payload = {
  data: [
    { transactionHash: "0xaaa", from: OTHER, to: SELF, value: "1000000", blockNumber: 10, timestamp: 1700000000 },
    { hash: "0xbbb", from: SELF, to: OTHER, amount: "500000", blockNumber: 11, blockTimestamp: 1700000100 },
  ],
};
const mapped = mapIndexerTransfers(payload, SELF);
assert.equal(mapped.length, 2);
assert.equal(mapped[0].kind, "in");
assert.equal(mapped[0].amount, 1000000n);
assert.equal(mapped[0].counterparty.toLowerCase(), OTHER);
assert.equal(mapped[1].kind, "out");
assert.equal(mapped[1].amount, 500000n);
// bad payloads never throw
assert.deepEqual(mapIndexerTransfers(null, SELF), []);
assert.deepEqual(mapIndexerTransfers({ data: "nope" }, SELF), []);

// --- viem Transfer log mapping ---
const logs = [
  { args: { from: OTHER, to: SELF, value: 2000000n }, transactionHash: "0xccc", blockNumber: 20n },
  { args: { from: SELF, to: OTHER, value: 750000n }, transactionHash: "0xddd", blockNumber: 21n },
];
const fromLogs = mapTransferLogs(logs as never, SELF);
assert.equal(fromLogs.length, 2);
assert.equal(fromLogs[0].kind, "in");
assert.equal(fromLogs[0].amount, 2000000n);
assert.equal(fromLogs[1].kind, "out");
assert.equal(fromLogs[1].counterparty.toLowerCase(), OTHER);

// --- dedupeEntries: identical self-transfer duplicate collapses; distinct rows kept ---
const dupSelf: HistoryEntry = { hash: "0xself", kind: "in", token: SELF as `0x${string}`, amount: 100n, counterparty: SELF as `0x${string}`, blockNumber: 5n, timestamp: 1 };
const distinct: HistoryEntry = { hash: "0xself", kind: "out", token: SELF as `0x${string}`, amount: 100n, counterparty: OTHER as `0x${string}`, blockNumber: 5n, timestamp: 1 };
assert.equal(dedupeEntries([dupSelf, { ...dupSelf }]).length, 1);
assert.equal(dedupeEntries([dupSelf, distinct]).length, 2);

console.log("indexer mappers OK");
