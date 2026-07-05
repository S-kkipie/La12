// WDK wrapper — the fan's embedded, self-custody wallet (spec §3, §5 tier 1).
//
// The seed phrase is generated client-side and never leaves the browser: it's
// AES-GCM encrypted with a non-extractable per-device CryptoKey and persisted
// in IndexedDB (see storage.ts). The server never sees the seed or the key.
//
// This module must only be imported from "use client" components — importing
// it from a Server Component or API route will throw (indexedDB is undefined
// server-side).
"use client";

import WDK from "@tetherto/wdk";
import WalletManagerEvm, { type WalletAccountEvm } from "@tetherto/wdk-wallet-evm";
import { toAccount } from "viem/accounts";
import type { LocalAccount } from "viem";
import { idbGet, idbSet } from "./storage";

const SEED_KEY = "wdk:encrypted-seed";
const DEVICE_KEY_KEY = "wdk:device-key";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111); // Sepolia
export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ??
  "0x0000000000000000000000000000000000dEaD") as `0x${string}`; // TODO(wire): real mock USD₮ address on Sepolia (spec §9)

type EncryptedPayload = { iv: number[]; ciphertext: number[] };

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

let cachedAccount: WalletAccountEvm | null = null;

async function loadAccount(freshSeed?: string): Promise<WalletAccountEvm> {
  if (cachedAccount) return cachedAccount;

  const seed =
    freshSeed ??
    (await (async () => {
      const payload = await idbGet<EncryptedPayload>(SEED_KEY);
      if (!payload) {
        throw new Error("No hay wallet todavía — llamá a createWallet() primero.");
      }
      return decryptSeed(payload);
    })());

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
  cachedAccount = account;
  return account;
}

/** Creates (or loads, if one already exists on this device) the fan's wallet. */
export async function createWallet(): Promise<{ address: string; isNew: boolean }> {
  const existing = await idbGet<EncryptedPayload>(SEED_KEY);
  if (existing) {
    const account = await loadAccount();
    return { address: await account.getAddress(), isNew: false };
  }

  const seed = WDK.getRandomSeedPhrase();
  await idbSet(SEED_KEY, await encryptSeed(seed));
  const account = await loadAccount(seed);
  return { address: await account.getAddress(), isNew: true };
}

/** Returns the fan's account (must call createWallet() at least once before). */
export async function getAccount(): Promise<WalletAccountEvm> {
  return loadAccount();
}

export async function hasWallet(): Promise<boolean> {
  return (await idbGet<EncryptedPayload>(SEED_KEY)) !== undefined;
}

export async function getUsdtBalance(): Promise<bigint> {
  const account = await getAccount();
  return account.getTokenBalance(USDT_ADDRESS);
}

export async function transferUsdt(recipient: `0x${string}`, amount: bigint) {
  const account = await getAccount();
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
 */
export async function signer(): Promise<LocalAccount> {
  const account = await getAccount();
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
