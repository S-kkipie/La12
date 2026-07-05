# ERC-4337 Gasless (mainnet-ready) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pay transaction gas in USD₮ (never ETH) via ERC-4337 account abstraction, so La Doce works on mainnet — while keeping the local anvil demo running on the current standard-EOA path.

**Architecture:** Introduce a **wallet mode** switch. `standard` mode (local anvil): WDK `WalletManagerEvm` EOA + viem writes + ETH pre-fund faucet (unchanged). `erc4337` mode (Sepolia/mainnet): WDK `WalletManagerEvmErc4337` Safe smart account, gas paid in USD₮ through a paymaster, contract calls executed as UserOperations via `account.sendTransaction({to, data})`. A single `WalletHandle` interface hides the difference so `lib/contracts.ts` and components don't branch.

**Tech Stack:** Next.js App Router, TypeScript, `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`, viem (calldata encoding + receipts + reads), Foundry (contracts), Candide bundler/paymaster (Sepolia public endpoints), Better Auth (unchanged).

## Global Constraints

- USD₮ = 6 decimals; all amounts are `bigint` base units.
- Self-custody: seed generated + AES-GCM encrypted in the browser (IndexedDB), keyed per userId (`wdk:encrypted-seed:<userId>`). Server never sees the seed.
- The WDK-derived wallet address that gets linked to the account (`profiles`/`clubs`) MUST be the address that actually holds funds and sends txs — the EOA in `standard` mode, the **smart-account address** in `erc4337` mode.
- Local anvil (chainId 31337) MUST keep working with zero external services (no bundler/paymaster exist locally) → it stays `standard` mode.
- Do not break any current behavior: invest → distribute → claim must still pass on anvil after every task.
- Env-driven config only; never hardcode keys/addresses. `NEXT_PUBLIC_*` for anything read client-side.
- WDK ERC-4337 config shape (from `docs/wdk-reference.md`): `{ chainId, provider, bundlerUrl, paymasterUrl, paymasterAddress, safeModulesVersion, paymasterToken: { address: USDT } }`.
- Verify WDK method behavior against current docs (context7 `/better-auth`… no — WDK: `docs.wdk.tether.io/llms-full.txt` + `docs/wdk-reference.md`) before relying on it; WDK is beta, signatures drift.

---

## File structure

- Create `web/lib/walletMode.ts` — resolves `NEXT_PUBLIC_WALLET_MODE` + all 4337 config from env. One responsibility: config.
- Modify `web/lib/wdk.ts` — build the right WDK manager per mode; expose a `WalletHandle` with `address`, `execute({to,data,value?})`, `getUsdtBalance()`, `transferUsdt()`. Keep per-user keying + signer() for standard mode.
- Modify `web/lib/contracts.ts` — invest/claim/distribute/approveUsdt build calldata with `encodeFunctionData` and route through `WalletHandle.execute`, then `waitForTransactionReceipt`. No direct viem walletClient writes.
- Modify `web/lib/ensureWallet.ts` — only pre-fund ETH gas in `standard` mode; in `erc4337` mode gas is paid in USD₮ (no ETH faucet).
- Modify `web/components/WalletCard.tsx` — gas UI is mode-aware (standard: "Conseguir ETH de gas"; erc4337: "Gas pagado en USD₮" info, no ETH button).
- Modify `web/.env.example` — document `NEXT_PUBLIC_WALLET_MODE` + bundler/paymaster/USDT-paymaster vars.
- Modify `contracts/script/Deploy.s.sol` (only if needed) — already parameterized for Sepolia; no change expected.
- Modify `README.md` + `docs/superpowers/specs/2026-07-05-la-doce-scaffold-design.md` — mainnet/gasless section.

---

## Task 1: Wallet-mode config module

**Files:**
- Create: `web/lib/walletMode.ts`
- Modify: `web/.env.example`
- Test: `web/lib/walletMode.test.ts` (run with `pnpm exec tsx`)

**Interfaces:**
- Produces: `walletMode(): "standard" | "erc4337"`; `erc4337Config(): { chainId, provider, bundlerUrl, paymasterUrl, paymasterAddress, safeModulesVersion, paymasterToken: { address: \`0x${string}\` } }` (throws if a required env var is missing when mode is erc4337); `USDT_ADDRESS: \`0x${string}\``.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/walletMode.test.ts
import assert from "node:assert";
import { walletMode } from "./walletMode";

process.env.NEXT_PUBLIC_WALLET_MODE = "erc4337";
assert.equal(walletMode(), "erc4337");
delete process.env.NEXT_PUBLIC_WALLET_MODE;
assert.equal(walletMode(), "standard"); // default
console.log("walletMode OK");
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd web && pnpm exec tsx lib/walletMode.test.ts`
Expected: FAIL — `Cannot find module './walletMode'`.

- [ ] **Step 3: Implement**

```ts
// web/lib/walletMode.ts
export type WalletMode = "standard" | "erc4337";

export function walletMode(): WalletMode {
  return process.env.NEXT_PUBLIC_WALLET_MODE === "erc4337" ? "erc4337" : "standard";
}

export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ??
  "0x0000000000000000000000000000000000dEaD") as `0x${string}`;

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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd web && pnpm exec tsx lib/walletMode.test.ts`
Expected: PASS — prints `walletMode OK`.

- [ ] **Step 5: Document env**

Append to `web/.env.example`:

```bash
# --- Wallet mode ---
# "standard" (EOA, ETH gas — local anvil) or "erc4337" (smart account, gas in USD₮ — testnet/mainnet)
NEXT_PUBLIC_WALLET_MODE=standard
# Required only when NEXT_PUBLIC_WALLET_MODE=erc4337 (Sepolia example: Candide public endpoints)
NEXT_PUBLIC_BUNDLER_URL=
NEXT_PUBLIC_PAYMASTER_URL=
NEXT_PUBLIC_PAYMASTER_ADDRESS=
NEXT_PUBLIC_SAFE_MODULES_VERSION=0.3.0
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/walletMode.ts web/lib/walletMode.test.ts web/.env.example
git commit -m "feat(web): wallet-mode config (standard vs erc4337)"
```

---

## Task 2: Unified WalletHandle in wdk.ts (build 4337 vs standard manager)

**Files:**
- Modify: `web/lib/wdk.ts`
- Test: `web/lib/wdk.smoke.test.ts`

**Interfaces:**
- Consumes: `walletMode()`, `erc4337Config()`, `USDT_ADDRESS` from Task 1.
- Produces: `getWallet(userId: string): Promise<WalletHandle>` where
  `WalletHandle = { address: \`0x${string}\`; mode: WalletMode; execute(call: { to: \`0x${string}\`; data: \`0x${string}\`; value?: bigint }): Promise<\`0x${string}\`>; getUsdtBalance(): Promise<bigint>; transferUsdt(recipient: \`0x${string}\`, amount: bigint): Promise<\`0x${string}\`> }`. `execute` returns the tx/UserOp hash. Keeps existing `createWallet(userId)`, `hasWallet(userId)` (unchanged behavior).

**Implementation notes (verify against WDK docs first):**
- `standard` mode: keep `WalletManagerEvm`; `execute` signs+sends via the existing viem `signer(userId)` → `walletClient.sendTransaction({ to, data, value })`.
- `erc4337` mode: `new WalletManagerEvmErc4337(seed, erc4337Config())`; `account = await wallet.getAccount(0)`; `execute` → `account.sendTransaction({ to, value: value ?? 0n, data })` (UserOperation, gas auto-paid in USD₮ by the paymaster). **VERIFY** WDK's ERC-4337 `sendTransaction` accepts a `data` field for arbitrary contract calls (docs show `{to, value}`; `data` is required for our contract). If it only exposes `transfer`, use the account's documented raw-call/execute method instead — confirm in `docs.wdk.tether.io` before implementing.
- `address` is `await account.getAddress()` in both modes — in 4337 this is the counterfactual smart-account address (differs from the EOA). That is the address that gets linked + funded.

- [ ] **Step 1: Write the smoke test (standard mode, runs against anvil)**

```ts
// web/lib/wdk.smoke.test.ts — standard-mode only (no bundler locally)
// NOTE: exercises the shape, not a browser. Uses a fixed seed via a tiny shim.
import assert from "node:assert";
// This test asserts the module exports getWallet and the WalletHandle shape.
import * as wdk from "./wdk";
assert.equal(typeof wdk.getWallet, "function");
console.log("wdk exports getWallet OK");
```

- [ ] **Step 2: Run, verify fail**

Run: `cd web && pnpm exec tsx lib/wdk.smoke.test.ts`
Expected: FAIL — `getWallet` is not a function (not yet exported).

- [ ] **Step 3: Implement getWallet + WalletHandle**

Add to `web/lib/wdk.ts` (keep existing per-user seed loading; add a mode branch). Key parts:

```ts
import WalletManagerEvmErc4337 from "@tetherto/wdk-wallet-evm-erc-4337";
import { walletMode, erc4337Config, USDT_ADDRESS } from "./walletMode";
import { encodeFunctionData } from "viem";
import mockUsdtAbiJson from "../../packages/abi/MockUSDT.json";

export type WalletHandle = {
  address: `0x${string}`;
  mode: ReturnType<typeof walletMode>;
  execute(call: { to: `0x${string}`; data: `0x${string}`; value?: bigint }): Promise<`0x${string}`>;
  getUsdtBalance(): Promise<bigint>;
  transferUsdt(recipient: `0x${string}`, amount: bigint): Promise<`0x${string}`>;
};

export async function getWallet(userId: string): Promise<WalletHandle> {
  const seed = await loadSeedFor(userId); // existing per-user decrypt; extract a helper if needed
  if (walletMode() === "erc4337") {
    const wallet = new WalletManagerEvmErc4337(seed, erc4337Config());
    const account = await wallet.getAccount(0);
    const address = (await account.getAddress()) as `0x${string}`;
    return {
      address,
      mode: "erc4337",
      async execute({ to, data, value }) {
        return (await account.sendTransaction({ to, value: value ?? 0n, data })).hash as `0x${string}`;
      },
      async getUsdtBalance() { return account.getTokenBalance(USDT_ADDRESS); },
      async transferUsdt(recipient, amount) {
        return (await account.transfer({ token: USDT_ADDRESS, recipient, amount })).hash as `0x${string}`;
      },
    };
  }
  // standard
  const account = await loadAccount(userId, seed);
  const address = (await account.getAddress()) as `0x${string}`;
  const local = await signer(userId);
  const { createWalletClient, http } = await import("viem");
  const { activeChain } = await import("./chain");
  const walletClient = createWalletClient({ account: local, chain: activeChain, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
  return {
    address,
    mode: "standard",
    async execute({ to, data, value }) {
      return walletClient.sendTransaction({ to, data, value, chain: activeChain });
    },
    async getUsdtBalance() { return account.getTokenBalance(USDT_ADDRESS); },
    async transferUsdt(recipient, amount) {
      const data = encodeFunctionData({ abi: mockUsdtAbiJson, functionName: "transfer", args: [recipient, amount] });
      return walletClient.sendTransaction({ to: USDT_ADDRESS, data, chain: activeChain });
    },
  };
}
```

(Adjust `loadSeedFor`/`loadAccount` to your existing per-user helpers; do not duplicate decrypt logic.)

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `cd web && pnpm exec tsx lib/wdk.smoke.test.ts && pnpm exec tsc --noEmit`
Expected: prints `wdk exports getWallet OK`; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/lib/wdk.ts web/lib/wdk.smoke.test.ts
git commit -m "feat(web): unified WalletHandle with erc4337 + standard modes"
```

---

## Task 3: Route contract calls through WalletHandle.execute

**Files:**
- Modify: `web/lib/contracts.ts`
- Modify: `web/components/InvestForm.tsx`, `web/components/ClaimButton.tsx`, `web/components/DistributeForm.tsx`, `web/components/CreateRoundForm.tsx`
- Test: manual anvil e2e (script) — `web/scripts/e2e-standard.mjs` (throwaway; do not commit)

**Interfaces:**
- Consumes: `getWallet(userId)` → `WalletHandle` (Task 2), `encodeFunctionData` (viem), the ABIs.
- Produces: `invest(wallet, roundAddress, amount)`, `claim(wallet, roundAddress)`, `distribute(wallet, roundAddress, revenue)`, `approveUsdt(wallet, spender, amount)`, `createRoundOnChain(wallet, params)` — all take a `WalletHandle` (not a viem LocalAccount), encode calldata, `wallet.execute(...)`, then `publicClient.waitForTransactionReceipt`.

- [ ] **Step 1: Rewrite the write helpers**

For each write, replace the viem `walletClient.writeContract` path with encode + execute. Example (`invest`):

```ts
import { encodeFunctionData } from "viem";
import type { WalletHandle } from "./wdk";

export async function invest(wallet: WalletHandle, roundAddress: `0x${string}`, amount: bigint) {
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "invest", args: [amount] });
  const hash = await wallet.execute({ to: roundAddress, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
```

Apply the same shape to `claim` (no args), `distribute` (args `[revenue]`), `approveUsdt` (`to: USDT_ADDRESS`, `approve` args `[spender, amount]`), and `createRoundOnChain` (`to: NEXT_PUBLIC_ROUND_FACTORY`, `createRound` args). Keep all read helpers (`pendingReward`, `roundState`, `usdtAllowance`, …) unchanged — they use `publicClient` and work in both modes.

- [ ] **Step 2: Update call sites**

In each component, replace `const account = await signer(userId); invest(account, …)` with `const wallet = await getWallet(userId); invest(wallet, …)`. The allowance-check → approve → invest sequence in `InvestForm` now uses `approveUsdt(wallet, round, amount)` then `invest(wallet, round, amount)`.

- [ ] **Step 3: Typecheck**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Prove standard mode still works end-to-end on anvil**

Write `web/scripts/e2e-standard.mjs` (throwaway) that, against the running anvil, drives approve→invest for a funded anvil key on the demo round and asserts shares minted. Run it.
Run: `cd web && node scripts/e2e-standard.mjs`
Expected: shares balance increases; no revert. (This mirrors the cast proof already done — it confirms the refactor didn't break the standard path.) Delete the script after.

- [ ] **Step 5: Commit**

```bash
git add web/lib/contracts.ts web/components/InvestForm.tsx web/components/ClaimButton.tsx web/components/DistributeForm.tsx web/components/CreateRoundForm.tsx
git commit -m "refactor(web): drive contract calls through WalletHandle (both wallet modes)"
```

---

## Task 4: Mode-aware gas (no ETH faucet in erc4337)

**Files:**
- Modify: `web/lib/ensureWallet.ts`
- Modify: `web/components/WalletCard.tsx`
- Test: `pnpm exec tsc --noEmit` + manual read of the rendered wallet page in each mode

**Interfaces:**
- Consumes: `walletMode()` (Task 1).

- [ ] **Step 1: Gate the gas pre-fund by mode**

In `ensureWallet.ts`, only POST `/api/faucet` (ETH pre-fund) when `walletMode() === "standard"`. In `erc4337` mode, skip it — gas is paid in USD₮ by the paymaster. Add a code comment explaining why.

- [ ] **Step 2: Mode-aware WalletCard gas UI**

In `WalletCard.tsx`: if `walletMode() === "standard"`, keep the "Conseguir ETH de gas" button. If `erc4337`, render an info line instead — "Gas pagado en USD₮ (sin ETH)" — and hide the ETH button. Keep the USD₮ test faucet button only when `NEXT_PUBLIC_USDT_ADDRESS` looks like a testnet MockUSDT (i.e., always show in standard/local; in erc4337-on-mainnet a real USD₮ has no public mint, so the button should no-op/hide — gate it on `walletMode() === "standard"`).

- [ ] **Step 3: Typecheck + visual check**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: clean. Then load `/wallet` in standard mode (anvil) → ETH gas button present; the erc4337 branch is covered by Task 6's Sepolia run.

- [ ] **Step 4: Commit**

```bash
git add web/lib/ensureWallet.ts web/components/WalletCard.tsx
git commit -m "feat(web): mode-aware gas (USD₮ paymaster in erc4337, no ETH faucet)"
```

---

## Task 5: Deploy contracts to Sepolia

**Files:**
- Modify: `contracts/.env` (local, gitignored) — deployer key + club address
- Uses: `contracts/script/Deploy.s.sol` (already Sepolia-ready)

**Interfaces:**
- Produces: deployed `MockUSDT`, `RoundFactory`, demo round addresses on Sepolia (chainId 11155111), recorded for Task 6.

- [ ] **Step 1: Fund a deployer**

Get a Sepolia deployer key with test ETH (a faucet — e.g. a public Sepolia faucet). Set `DEPLOYER_PK` + `CLUB_ADDRESS` in `contracts/.env`.

- [ ] **Step 2: Deploy**

Run: `cd contracts && DEPLOYER_PK=$DEPLOYER_PK CLUB_ADDRESS=$CLUB_ADDRESS forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast`
Expected: prints MockUSDT / RoundFactory / Demo round addresses; `Script ran successfully`.

- [ ] **Step 3: Record addresses**

Note the three addresses. (No commit — addresses go into `.env.local`, which is gitignored.)

---

## Task 6: Sepolia gasless verification (the real mainnet-path proof)

**Files:**
- Modify: `web/.env.local` (gitignored) — Sepolia + erc4337 config
- Test: real gasless invest on Sepolia

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Configure erc4337 on Sepolia**

Set in `web/.env.local`:
```bash
NEXT_PUBLIC_WALLET_MODE=erc4337
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=<sepolia rpc>
NEXT_PUBLIC_USDT_ADDRESS=<MockUSDT from Task 5>
NEXT_PUBLIC_ROUND_FACTORY=<RoundFactory from Task 5>
DEMO_ROUND_ADDRESS=<demo round from Task 5>
NEXT_PUBLIC_BUNDLER_URL=https://api.candide.dev/public/v3/11155111
NEXT_PUBLIC_PAYMASTER_URL=https://api.candide.dev/public/v3/11155111
NEXT_PUBLIC_PAYMASTER_ADDRESS=<Candide Sepolia paymaster>
NEXT_PUBLIC_SAFE_MODULES_VERSION=0.3.0
```
Reseed the DB round via the deployed address. Verify the Candide Sepolia bundler/paymaster URLs + paymaster address against current Candide docs (they change).

- [ ] **Step 2: Fund the smart account with test USD₮ only**

Sign up a fan in the app → note the **smart-account address** shown. Mint test USD₮ to it (MockUSDT.mint via cast) — and **deliberately send it 0 ETH**. This is the whole point: no ETH.

- [ ] **Step 3: Gasless invest**

In the browser, invest. Expected: approve + invest succeed as UserOperations; the smart account's USD₮ decreases by the invested amount **plus a small paymaster gas fee in USD₮**; ETH balance stays exactly 0. Confirm via a block explorer (UserOperation shows paymaster) + `cast balance <smartAccount>` == 0.

- [ ] **Step 4: Record the proof**

Capture the UserOp hash / explorer link + before/after USD₮ and ETH balances. This is the artifact proving mainnet-viability.

- [ ] **Step 5: Restore local demo**

Set `web/.env.local` back to the anvil/standard values so the local demo keeps working. (No commit — `.env.local` is gitignored.)

---

## Task 7: Docs

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-07-05-la-doce-scaffold-design.md`, `web/.env.example`

- [ ] **Step 1: README — gas model section**

Add a "Gas: cómo el hincha nunca toca ETH" section: standard mode (local demo, ETH pre-fund) vs erc4337 mode (mainnet, gas en USD₮ vía paymaster WDK). Include the Sepolia proof link from Task 6.

- [ ] **Step 2: Spec addendum**

In the design spec, note that approach A (ERC-4337) is now implemented as `NEXT_PUBLIC_WALLET_MODE=erc4337`, and approach B (pre-fund) is the local-demo default.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-07-05-la-doce-scaffold-design.md web/.env.example
git commit -m "docs: gasless (erc4337) mainnet gas model + config"
```

---

## Risks / notes

- **Biggest unknown:** whether WDK's ERC-4337 `account.sendTransaction` accepts arbitrary `{to, data}` calldata (needed for our contract). Verify in WDK docs at the start of Task 2; if the API differs, the fix is localized to `WalletHandle.execute` in `wdk.ts` only.
- **Testnet paymaster availability:** Candide public Sepolia endpoints may rate-limit or change. If flaky, the local standard-mode demo is unaffected; Task 6 is the only task that depends on them.
- **First-tx bootstrap:** in erc4337, the smart account needs some USD₮ before its first action (to pay the paymaster). The funding flow (MoonPay / test faucet) must land USD₮ first — invest cannot be the very first op on an empty account.
- **Client bundle:** `@tetherto/wdk-wallet-evm-erc-4337` may pull native deps like `wdk-wallet-evm` did (sodium). If the build breaks, mirror the existing `serverExternalPackages` fix in `next.config.ts`.
