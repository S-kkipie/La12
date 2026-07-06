// WDK wrapper — the fan's embedded, self-custody wallet (spec §3, §5 tier 1).
//
// The seed phrase is generated client-side and never leaves the browser: it's
// AES-GCM encrypted with a non-extractable per-device CryptoKey and persisted
// in IndexedDB (see storage.ts). The server never sees the seed or the key.
//
// Keyed per Better Auth userId (not one global seed): this app now has real
// multi-account sign-in (club + fan), and two accounts created in the same
// browser must NOT end up sharing a wallet. Every export below takes the
// caller's userId — resolve it from the session (authClient.useSession() /
// the signUp/signIn response) at the call site; this module stays
// auth-agnostic and just treats it as an opaque namespacing key.
//
// Dual wallet mode (see walletMode.ts): "standard" registers the plain EOA
// `WalletManagerEvm` (local anvil demo, unchanged); "erc4337" registers the
// Safe smart-account `WalletManagerEvmErc4337` instead, gas paid in USD₮ via
// a paymaster. `getWallet()` hides the difference behind one `WalletHandle`
// so lib/contracts.ts and components never need to branch on mode.
//
// This module must only be imported from "use client" components — importing
// it from a Server Component or API route will throw (indexedDB is undefined
// server-side).
"use client";

import WDK from "@tetherto/wdk";
import WalletManagerEvm, { type WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import WalletManagerEvmErc4337, { type WalletAccountEvmErc4337 } from "@tetherto/wdk-wallet-evm-erc-4337";
import { createWalletClient, http, type LocalAccount } from "viem";
import { toAccount } from "viem/accounts";
import { activeChain, CHAIN_ID } from "./chain";
import { walletMode, erc4337Config, USDT_ADDRESS } from "./walletMode";
import { idbGet, idbSet } from "./storage";

export { USDT_ADDRESS };

const SEED_KEY_PREFIX = "wdk:encrypted-seed:";
const DEVICE_KEY_KEY = "wdk:device-key"; // one encryption key per device, shared by all local accounts

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

type EncryptedPayload = { iv: number[]; ciphertext: number[] };

function seedKey(userId: string): string {
  return `${SEED_KEY_PREFIX}${userId}`;
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(DEVICE_KEY_KEY);
  if (existing) return existing;
  // Non-extractable: IndexedDB can store CryptoKey objects directly (structured
  // clone), so the raw bytes are never exposed to JS, even to this module.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await idbSet(DEVICE_KEY_KEY, key);
  return key;
}

async function encryptSeed(seed: string): Promise<EncryptedPayload> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(seed),
  );
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptSeed(payload: EncryptedPayload): Promise<string> {
  const key = await getOrCreateDeviceKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
    key,
    new Uint8Array(payload.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Decrypts this user's stored seed. Shared by every path that needs the raw
 * seed (the standard-mode `loadAccount` below, and `getWallet`'s erc4337
 * branch) so the decrypt logic lives in exactly one place.
 */
async function loadSeedFor(userId: string): Promise<string> {
  const payload = await idbGet<EncryptedPayload>(seedKey(userId));
  if (!payload) {
    throw new Error("No hay wallet todavía — llamá a createWallet() primero.");
  }
  return decryptSeed(payload);
}

// One cached account per userId per mode — never a single shared slot.
// Logging in as a different account in the same tab must never hand back a
// stale account. Two maps (not a union in one) because standard's
// WalletAccountEvm and erc4337's WalletAccountEvmErc4337 are different
// classes with different constructors — see getWallet() below.
const cachedAccounts = new Map<string, WalletAccountEvm>();
const cachedErc4337Accounts = new Map<string, WalletAccountEvmErc4337>();

async function loadAccount(userId: string, freshSeed?: string): Promise<WalletAccountEvm> {
  const cached = cachedAccounts.get(userId);
  if (cached) return cached;

  const seed = freshSeed ?? (await loadSeedFor(userId));

  const wdk = new WDK(seed).registerWallet("ethereum", WalletManagerEvm, {
    provider: RPC_URL,
    chainId: CHAIN_ID,
  });

  // NOTE: WDK's beta type declarations return `IWalletAccountWithProtocols`
  // for `getAccount()`, which (as of 1.0.0-beta.13) omits the base account
  // members (getAddress, transfer, sendTransaction, ...) from its .d.ts even
  // though they're present at runtime — the decorator only adds protocol
  // registration methods on top of the real WalletAccountEvm. Cast through
  // `unknown` to recover the full, documented surface.
  const account = (await wdk.getAccount("ethereum", 0)) as unknown as WalletAccountEvm;
  cachedAccounts.set(userId, account);
  return account;
}

/** Creates (or loads, if one already exists on this device) this user's wallet. */
export async function createWallet(userId: string): Promise<{ address: string; isNew: boolean }> {
  const existing = await idbGet<EncryptedPayload>(seedKey(userId));
  if (existing) {
    const account = await loadAccount(userId);
    return { address: await account.getAddress(), isNew: false };
  }

  const seed = WDK.getRandomSeedPhrase();
  await idbSet(seedKey(userId), await encryptSeed(seed));
  const account = await loadAccount(userId, seed);
  return { address: await account.getAddress(), isNew: true };
}

/**
 * Returns this user's standard-mode EOA account (must call createWallet(userId)
 * at least once before). Always the EOA, regardless of walletMode() — in
 * erc4337 mode the address that actually holds funds and sends txs is the
 * smart account, not this one. Use `getWallet(userId)` for a mode-correct
 * handle; this is a low-level primitive `signer()` builds on.
 */
export async function getAccount(userId: string): Promise<WalletAccountEvm> {
  return loadAccount(userId);
}

export async function hasWallet(userId: string): Promise<boolean> {
  return (await idbGet<EncryptedPayload>(seedKey(userId))) !== undefined;
}

/** @deprecated Always reads the standard-mode EOA — use `(await getWallet(userId)).getUsdtBalance()` instead, which is correct in both modes. */
export async function getUsdtBalance(userId: string): Promise<bigint> {
  const account = await getAccount(userId);
  return account.getTokenBalance(USDT_ADDRESS);
}

/** @deprecated Always sends from the standard-mode EOA — use `(await getWallet(userId)).transferUsdt(...)` instead, which is correct in both modes. */
export async function transferUsdt(userId: string, recipient: `0x${string}`, amount: bigint) {
  const account = await getAccount(userId);
  return account.transfer({ token: USDT_ADDRESS, recipient, amount });
}

/**
 * Bridges the WDK-managed account to a viem `LocalAccount`, so `contracts.ts`
 * can drive our RevenueShareRound contract with a normal viem `walletClient`
 * while the actual signing happens through the WDK-derived key (spec §3:
 * "viem drives our custom contract, signing with the WDK-derived key").
 *
 * WDK doesn't hand out the raw private key (memory-safe by design), so this
 * delegates every signature to the account's own sign/signTransaction/
 * signTypedData methods instead of constructing a viem PrivateKeyAccount.
 *
 * Standard mode only — erc4337 accounts sign UserOperations, not viem
 * transactions; see `getWallet()`'s `execute()` for that path.
 */
export async function signer(userId: string): Promise<LocalAccount> {
  const account = await getAccount(userId);
  const address = (await account.getAddress()) as `0x${string}`;

  return toAccount({
    address,
    async signMessage({ message }) {
      // TODO(wire): raw-bytes messages (`{ raw }`) aren't representable by
      // WDK's string-based `sign()`; only UTF-8 string messages are handled.
      const text = typeof message === "string" ? message : new TextDecoder().decode(message.raw as Uint8Array);
      return (await account.sign(text)) as `0x${string}`;
    },
    async signTransaction(transaction) {
      // viem's TransactionSerializable is a union (legacy/eip1559/eip4844/...);
      // narrow loosely to the fields WDK's EvmTransaction understands.
      const tx = transaction as unknown as {
        to?: `0x${string}` | null;
        value?: bigint;
        data?: `0x${string}`;
        gas?: bigint;
        gasPrice?: bigint;
        maxFeePerGas?: bigint;
        maxPriorityFeePerGas?: bigint;
        nonce?: number;
        chainId?: number;
      };
      const signed = await account.signTransaction({
        to: tx.to ?? undefined,
        value: tx.value ?? 0n,
        data: tx.data,
        gasLimit: tx.gas,
        gasPrice: tx.gasPrice,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        nonce: tx.nonce,
        chainId: tx.chainId ?? CHAIN_ID,
      });
      return signed as `0x${string}`;
    },
    async signTypedData(parameters) {
      // TODO(wire): verify domain/types round-trip for every typed-data shape
      // we end up needing (WDK signs via ethers.js under the hood).
      const { domain, types, message } = parameters as unknown as {
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        message: Record<string, unknown>;
      };
      return (await account.signTypedData({
        domain: domain as never,
        types: types as never,
        message,
      })) as `0x${string}`;
    },
  });
}

/**
 * Bundler's `sendUserOperation` resolves with the UserOp hash, not an L1 tx
 * hash — `eth_getTransactionReceipt` (what viem's `waitForTransactionReceipt`
 * polls) will never find it, it only exists on the bundler's side until the
 * op lands. Poll the bundler's own receipt endpoint instead and hand back
 * the real `transactionHash` once it's included, so every caller downstream
 * (`contracts.ts`) can keep using plain viem receipt-waiting unmodified.
 */
async function waitForUserOpTransactionHash(
  account: WalletAccountEvmErc4337,
  userOpHash: string,
  { intervalMs = 2000, timeoutMs = 60_000 } = {}
): Promise<`0x${string}`> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await account.getUserOperationReceipt(userOpHash);
    if (receipt) return receipt.receipt.transactionHash as `0x${string}`;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`UserOperation ${userOpHash} not included within ${timeoutMs}ms`);
}

/**
 * Unified wallet surface `lib/contracts.ts` and components drive contract
 * calls through, regardless of wallet mode — see walletMode.ts. `execute()`
 * is the one primitive that matters here: standard mode signs+sends a plain
 * viem transaction; erc4337 mode signs+sends a UserOperation (gas pulled
 * from the smart account's own USD₮ by the paymaster). Both return a real,
 * minable L1 tx hash that `waitForTransactionReceipt` can wait on (erc4337
 * via `waitForUserOpTransactionHash` above).
 *
 * Invariant this whole module exists to uphold: `.address` here is the ONE
 * address that gets linked to the account (ensureWallet.ts), displayed
 * (WalletCard), funded, read from (ClaimButton's pendingReward, allowance
 * checks), and sent from (`execute`) — the EOA in standard mode, the Safe
 * smart-account address in erc4337 mode. Every call site that needs "my
 * wallet address" should go through `getWallet(userId).address`, never
 * `createWallet`'s return value or the standalone `getAccount`/
 * `getUsdtBalance` exports above (those are always the EOA).
 */
export type WalletHandle = {
  address: `0x${string}`;
  mode: ReturnType<typeof walletMode>;
  execute(call: { to: `0x${string}`; data: `0x${string}`; value?: bigint }): Promise<`0x${string}`>;
  getUsdtBalance(): Promise<bigint>;
  transferUsdt(recipient: `0x${string}`, amount: bigint): Promise<`0x${string}`>;
};

export async function getWallet(userId: string): Promise<WalletHandle> {
  if (walletMode() === "erc4337") {
    // Cached per userId, same as the standard account below — building the
    // manager + deriving the account is real async work (and the account is
    // kept alive, not disposed, precisely so it CAN be reused across calls;
    // disposing would wipe the key material and defeat the cache).
    let account = cachedErc4337Accounts.get(userId);
    if (!account) {
      const seed = await loadSeedFor(userId);
      const wallet = new WalletManagerEvmErc4337(seed, erc4337Config());
      account = await wallet.getAccount(0);
      cachedErc4337Accounts.set(userId, account);
    }
    const address = (await account.getAddress()) as `0x${string}`;

    // VERIFIED against the installed package's types (types/src/
    // wallet-account-read-only-evm-erc-4337.d.ts): `EvmErc4337Transaction`
    // has an optional `data?: string` field ("The call's data in hex
    // format"), so sendTransaction({ to, value, data }) does carry arbitrary
    // contract calldata as a UserOperation — the plan's "biggest unknown"
    // resolves in our favor, no adapter needed.
    return {
      address,
      mode: "erc4337",
      async execute({ to, data, value }) {
        const result = await account.sendTransaction({ to, value: value ?? 0n, data });
        return waitForUserOpTransactionHash(account, result.hash);
      },
      async getUsdtBalance() {
        return account.getTokenBalance(USDT_ADDRESS);
      },
      async transferUsdt(recipient, amount) {
        const result = await account.transfer({ token: USDT_ADDRESS, recipient, amount });
        return waitForUserOpTransactionHash(account, result.hash);
      },
    };
  }

  // standard — loadAccount already caches per userId (and only decrypts the
  // seed on a cache miss), so no seed is read here unless actually needed.
  const account = await loadAccount(userId);
  const address = (await account.getAddress()) as `0x${string}`;
  const local = await signer(userId);
  const walletClient = createWalletClient({ account: local, chain: activeChain, transport: http(RPC_URL) });

  return {
    address,
    mode: "standard",
    async execute({ to, data, value }) {
      return walletClient.sendTransaction({ to, data, value: value ?? 0n, chain: activeChain });
    },
    async getUsdtBalance() {
      return account.getTokenBalance(USDT_ADDRESS);
    },
    async transferUsdt(recipient, amount) {
      const result = await account.transfer({ token: USDT_ADDRESS, recipient, amount });
      return result.hash as `0x${string}`;
    },
  };
}
