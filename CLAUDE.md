# La Doce — project rules

Tokenized **revenue-share** for football clubs. Fans fund a club in USD₮, collect pro-rata
revenue, self-custody wallets. Tether WDK hackathon, **WDK track**. Deadline **2026-07-14**.

Product: `README.md`. Design spec: `docs/superpowers/specs/2026-07-05-la-doce-scaffold-design.md`.
WDK API notes: `docs/wdk-reference.md`.

## Stack
- **contracts/** — Foundry + OpenZeppelin v5. `RevenueShareRound` (share = ERC-20, claim-based
  dividend pattern) + `RoundFactory`. Run: `forge build`, `forge test -vv` (need `~/.foundry/bin` on PATH).
- **web/** — Next.js App Router (TS, Tailwind) + SQLite (better-sqlite3 + Drizzle) + viem + WDK client.
- **packages/abi/** — contract ABIs shared into web.
- Chain: **EVM, Sepolia testnet**. USD₮ = 6 decimals.

## Conventions
- WDK packages: `@tetherto/wdk-*`. Core = `@tetherto/wdk`, wallet = `@tetherto/wdk-wallet-evm`.
  WDK = wallets + USD₮ transfers + data (Indexer, MoonPay, Price Rates). **viem drives our custom
  contract**, signing with the WDK-derived key. Don't conflate the two.
- Money truth = on-chain. SQLite = UX/metadata + event cache only.
- Self-custody: fan seed generated + encrypted in browser (IndexedDB). Server NEVER holds the key.
- Gas: server sponsors gas (approach B, pre-fund) — never touches the fan's key. ERC-4337 gasless = stretch.
- Amounts are base units (`bigint`). USD₮ = 6 decimals (`1 USDT = 1_000000n`).
- Instrument is **revenue-share (economic rights), NOT equity** — no custody, no securities. Keep it that way.

## WDK integration tiers (cut from bottom under deadline)
1. wallet-evm + USD₮ transfer + gas-sponsor · 2. Indexer API · 3. MoonPay on-ramp ·
4. Price Rates · 5. Velora swap · 6. Aave lending. Tiers 1–4 = committed MVP; 5–6 = stretch.

## Out of scope
QVAC, Pears, any non-WDK track. USD₮0 cross-chain bridge = roadmap. Secondary P2P market is
*enabled* by the ERC-20 share but not built now.

## For AI assistants building with WDK
- Full WDK docs (one file): `docs.wdk.tether.io/llms-full.txt`. Raw markdown of any page: append `.md`.
- MCP: `@tetherto/wdk-mcp-toolkit` exposes wallets as agent tools.
