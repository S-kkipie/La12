# WDK Reference — La Doce

Curated notes from **docs.wdk.tether.io** (fetched 2026-07-05), focused on our
revenue-share MVP: embedded self-custody wallets + USD₮ payments on EVM.

- Full docs dump (1.1 MB, all pages): `docs.wdk.tether.io/llms-full.txt`
- Page index: `docs.wdk.tether.io/llms.txt`
- Raw markdown of any page: append `.md` to the page URL *(note: some `.md` URLs 404 — use the HTML URL as fallback)*
- GitHub: https://github.com/tetherto/wdk · Docs source: https://github.com/tetherto/wdk-docs

---

## TL;DR for our stack

| Need | WDK piece |
|---|---|
| Embedded wallet, user never touches keys | `@tetherto/wdk` + `@tetherto/wdk-wallet-evm` (or ERC-4337) |
| **Gas paid in USD₮ (no ETH needed) — "UX tipo Yape"** | `@tetherto/wdk-wallet-evm-erc-4337` with `paymasterToken` = USDT |
| Send USD₮ (fund round, payout to holders) | `account.transfer({ token, recipient, amount })` |
| Read balances / history | `account.getBalance()`, `account.getTokenBalance(token)`, Indexer API |
| Test without real money | Sepolia testnet + Pimlico/Candide mock USD₮ faucets |

**Decision candidate:** use **ERC-4337 gasless** so hinchas pay tx fees in USD₮ itself
— removes the "need ETH for gas" friction that would kill the demo UX. This directly
answers README open item "red USDt que expone WDK".

USDT mainnet ERC-20 contract used throughout docs: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

---

## Install

```bash
mkdir wdk-quickstart && cd wdk-quickstart && npm init -y && npm pkg set type=module
npm install @tetherto/wdk @tetherto/wdk-wallet-evm
# gasless smart accounts (pay fees in USDT):
npm install @tetherto/wdk-wallet-evm-erc-4337
```

Runtime: Node.js (also works in Bare runtime; React Native needs Node 22+).

---

## Core flow (standard EVM account)

```javascript
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

// 1. seed phrase = the user's self-custody key (store securely, never log in prod)
const seedPhrase = WDK.getRandomSeedPhrase()          // 12 words; pass 24 for 24-word

// 2. register chain(s) — one seed derives accounts for every chain (BIP-44)
const wdk = new WDK(seedPhrase)
  .registerWallet('ethereum', WalletManagerEvm, { provider: 'https://eth.drpc.org' })

// 3. account 0
const account = await wdk.getAccount('ethereum', 0)
const address = await account.getAddress()

// 4. balances (native = wei; token = base units)
const eth  = await account.getBalance()
const usdt = await account.getTokenBalance('0xdAC17F958D2ee523a2206206994597C13D831ec7')
```

### Send native ETH
```javascript
const result = await account.sendTransaction({
  to: '0x742d35Cc...',
  value: 1000000000000000000n   // 1 ETH in wei
})
console.log(result.hash)
// estimate first: await account.quoteSendTransaction({ to, value }) -> { fee }
```

### Transfer ERC-20 / USD₮  ← the core of every La Doce money flow
```javascript
// estimate
const quote = await account.quoteTransfer({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  recipient: '0x742d35Cc...',
  amount: 1000000n            // base units. USDT = 6 decimals -> 1 USDT = 1_000000n
})

// pre-checks
const bal = await account.getTokenBalance(token)
if (bal < amount) throw new Error('Insufficient USDT')
// standard EVM: also need native ETH for gas (see gasless below to avoid this)

// send
const res = await account.transfer({ token, recipient, amount })
console.log(res.hash, res.fee)
```

**Watch the decimals:** USD₮ on Ethereum/Tron = **6 decimals**, not 18. `1 USDT = 1_000000n`.
Amounts are always `BigInt` base units.

---

## Gasless smart accounts (ERC-4337) — recommended for the demo

User pays transaction fees **in USD₮**, never needs ETH. Wallet is a Safe smart account.

```javascript
import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

const wallet = new WalletManagerEvmErc4337(seedPhrase, {
  chainId: 1,
  provider: 'https://rpc.mevblocker.io/fast',
  bundlerUrl: 'https://api.candide.dev/public/v3/1',
  paymasterUrl: 'https://api.candide.dev/public/v3/1',
  paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
  safeModulesVersion: '0.3.0',
  paymasterToken: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' } // USDT pays gas
})

const account = await wallet.getAccount(0)
const address = await account.getAddress()

// same API as standard account:
await account.sendTransaction({ to, value })
await account.transfer({ token, recipient, amount })   // fee deducted in USDT

// read-only handle (e.g. show a club's balance without keys):
const ro = await account.toReadOnlyAccount()

// fees + cleanup
const rates = await wallet.getFeeRates()   // { normal, fast }
account.dispose(); wallet.dispose()        // wipe keys from memory (irreversible)
```

Error handling: `sendTransaction`/`transfer` throw on
`'not enough funds'` (insufficient paymaster token) or `'Exceeded maximum fee'`. Wrap in try/catch.

Testnet: Sepolia config in ERC-4337 configuration page. Mock USD₮ faucets:
- Pimlico: https://dashboard.pimlico.io/test-erc20-faucet
- Candide: https://dashboard.candide.dev/faucet

---

## Module map (npm — all under `@tetherto/`)

| Package | Use |
|---|---|
| `@tetherto/wdk` | core orchestrator (`getRandomSeedPhrase`, `registerWallet`, `getAccount`) |
| `@tetherto/wdk-wallet-evm` | Ethereum/Polygon/Arbitrum/etc accounts |
| `@tetherto/wdk-wallet-evm-erc-4337` | **gasless** smart accounts, fees in USD₮ |
| `@tetherto/wdk-wallet-evm-7702-gasless` | EIP-7702 gasless variant |
| `@tetherto/wdk-wallet-tron` / `-tron-gasfree` | TRON (USD₮-TRC20; gas-free option) |
| `@tetherto/wdk-wallet-ton` / `-ton-gasless` | TON |
| `@tetherto/wdk-wallet-btc`, `-solana`, `-spark` | BTC, Solana, Lightning L2 |
| `@tetherto/wdk-protocol-bridge-usdt0-evm` | bridge USD₮0 across chains (LayerZero) |
| `@tetherto/wdk-protocol-swap-velora-evm` | DEX swap |
| `@tetherto/wdk-protocol-lending-aave-evm` | Aave lending (idle-cash yield idea) |
| `@tetherto/wdk-protocol-fiat-moonpay` | fiat on/off ramp |
| `@tetherto/wdk-mcp-toolkit` | expose wallets as MCP tools for AI agents |

Tools: Indexer API (balances/history across chains), Failover Provider, Price Rates,
React Native UI Kit + Secure Storage, `create-wdk-module`.

---

## Open questions this resolves / raises

- ✅ **Which USD₮ network** → EVM (Ethereum/Polygon) with ERC-4337 gasless is cleanest for demo;
  Tron gas-free is an alt. Decide chain → set `chainId`/`provider`.
- ⬜ Pick testnet (Sepolia) provider + bundler/paymaster keys (Candide public works for demo).
- ⬜ Revenue-share contract: WDK moves USD₮ in/out of wallets; the pro-rata split logic is our
  own smart contract (WDK ≠ the distribution contract). Contract holds round funds, splits to holders.
- ⬜ Frontend: React Native UI Kit exists if we go mobile; else web + wdk-wallet-evm in a server/edge.

Key pages to read next:
- Node.js Quickstart: https://docs.wdk.tether.io/start-building/nodejs-bare-quickstart
- Wallet EVM: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm
- ERC-4337 gasless: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337
- Core module (register wallets/protocols): https://docs.wdk.tether.io/sdk/core-module
- Indexer API: https://docs.wdk.tether.io/tools/indexer-api
