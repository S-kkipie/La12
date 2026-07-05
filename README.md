# La Doce ⚽ (La 12)

> *"Compra un pedazo de los ingresos de tu club. Inviertes en USDt, cobras en USDt, tus llaves son tuyas."*

Tokenización de clubes de fútbol: los hinchas financian a su club y cobran parte de los
ingresos, con wallet self-custody y liquidación en USDt. Sin banco, sin intermediario.

El nombre **La Doce** = "el jugador número 12", la hinchada. El hincha deja de ser espectador
y pasa a ser dueño de un pedazo del club.

---

## 1. El Hackathon — Tether Developers Cup 🏆

- **Organiza:** Tether · plataforma: DoraHacks
- **URL:** https://dorahacks.io/hackathon/tether-developers-cup
- **Formato:** competencia global, temática fútbol, estilo torneo de eliminación (knockout).
- **Modalidad:** virtual. Gratis. Solo o equipo hasta 4. Mayores de 18.
- **Prize pool:** 8,000 USDt
  - **1,000 USDt** por track ganador (Pears, QVAC, WDK)
  - **5,000 USDt** Cup Champion (mejor proyecto global)

### Fechas clave
| Fecha | Hito |
|---|---|
| Jun 28 | Registro abre / building empieza |
| Jul 6 | Cierra registro, se bloquea el campo |
| Jul 8 | Ronda de 16 — se espera prototipo + demo |
| Jul 12 | Semifinal — corte a 4 finalistas |
| **Jul 14, 23:59 (GMT-7)** | **Deadline de submission en DoraHacks** |
| Jul 15 | Final — pitch en vivo |
| Jul 19 | Ganadores anunciados |

### Tracks (elegimos WDK)
- **Pears** — apps P2P (Hyperswarm, Hypercore, Autobase). Docs: docs.pears.com
- **QVAC** — IA local on-device, sin cloud. Docs: qvac.tether.io
- **WDK** — Wallet Development Kit: wallets self-custody + pagos. Docs: wdk.tether.io ← **NUESTRO TRACK**

### Requisitos de submission
- Repo público (GitHub/GitLab/Bitbucket) con licencia permisiva (Apache 2.0 / MIT).
- Instrucciones de setup claras (que un juez lo corra out-of-the-box).
- Video demo, máx **3 min**, YouTube unlisted.
- El proyecto **debe encajar en el tema fútbol**.

### Criterios de evaluación (1–5 cada uno)
- Ambición técnica
- Experiencia de usuario (UX)
- Utilidad en el mundo real
- Creatividad
- **Uso real de la plataforma Tether elegida** (WDK)

---

## 2. La Idea

### Problema
- Los clubes de fútbol chicos (Liga 2, Copa Perú, barrio) **son MYPES**: generan ingresos,
  tienen hinchas, crecen — pero **nadie les presta capital**. Bancos no; solo prestamistas caros.
- Miles de hinchas quieren apoyar (y ganar) pero no hay forma de invertir en su club.
- Hay un vacío enorme entre el club y su gente.

### Solución
Un club emite **revenue-share tokenizado**: pide capital en USDt y a cambio reparte un % de un
ingreso visible (taquilla, merch) por N meses hasta un múltiplo cap. El hincha invierte USDt,
recibe un token, y cobra su parte de cada reparto — todo en su wallet self-custody.

**El gancho:** el banco no le presta al club del barrio; el hincha sí — invierte por amor + retorno.
Eso resuelve el arranque en frío y la confianza que mata a todo marketplace.

### Ejemplo
> Deportivo San Martín (barrio) necesita **S/40,000 (~USDt)** para reflectores.
> Emite revenue-share: **8% de la taquilla por 24 meses**, cap 1.5x.
> 400 hinchas invierten ~USDt 100 c/u. Cobran su parte cada partido, automático, en USDt.

---

## 3. Por qué WDK (track elegido)

Todo el producto **es flujo de dinero** → WDK es la estrella natural. Instrumento elegido:
**revenue-share** (NO equity — evita regulación de valores y custodia).

### Los flujos WDK (esto ES el demo)
| # | Flujo | Qué hace WDK |
|---|---|---|
| 1 | Hincha se registra | wallet embebida se crea sola (self-custody bajo el capó, UX tipo Yape) |
| 2 | Hincha fondea | deposita USDt en su wallet |
| 3 | Hincha invierte | manda USDt → contrato de ronda del club → recibe token |
| 4 | Club cobra | al llenar la meta, USDt salta a la wallet WDK del club |
| 5 | Reparto | ingreso entra → contrato reparte USDt pro-rata a holders → cae en su wallet |
| 6 | Retiro | hincha retira USDt cuando quiere — llaves suyas, nadie las congela |

**Momento "wow":** cobro en la fuente — la taquilla del club entra por la wallet WDK y el contrato
retiene el % automático antes de pasar el resto. Sin oráculo, sin confianza, todo on-chain en USDt.

---

## 4. MVP (11 días)

1. Club crea perfil + publica ronda (monto, %, cap, plazo).
2. Hincha: wallet WDK embebida → invierte en USDt.
3. Contrato de revenue-share reparte USDt pro-rata a holders.
4. Skin de fútbol encima (club peruano ficticio "Deportivo San Martín" para el demo).

### Fuera de alcance (mencionar como roadmap, NO construir)
- **MYPE Score con IA** → fase 2 con QVAC (IA on-device lee finanzas y da score de riesgo).
- **Mercado secundario P2P** → fase 2 con Pears (liquidez, revender el token).
- **Equity real / notas convertibles** → cuando haya licencia y estructura legal.

---

## 5. Visión a largo plazo

La Doce empieza por el fútbol (beachhead: clubes = MYPES con hinchas emocionalmente comprometidos),
pero el mismo motor sirve para **cualquier empresa privada del Perú y LATAM**: el mercado privado
digital donde cualquier negocio levanta capital y cualquier persona invierte desde montos chicos,
con transparencia, liquidez y (fase 2) riesgo calificado por IA local. Blockchain invisible;
dividendos en USDt.

---

## 6. Riesgo #1 — regulatorio (decirlo antes que el juez)

Emitir "acciones" = entrar en regulación de mercado de valores. Por eso arrancamos con
**revenue-share / derechos económicos** (instrumento más liviano, no-custodio) y self-custody
(el usuario tiene sus llaves, la plataforma no custodia fondos). Antecedente a NO repetir:
**Football Index** colapsó por ser gambling opaco sin propiedad real — nosotros: propiedad
on-chain, transparente, self-custody.

---

## 7. Decisiones (resueltas en brainstorming — ver `docs/superpowers/specs/`)

- [x] Red: **EVM / Ethereum (Sepolia testnet)**, USD₮ ERC-20. WDK wallet-evm; gasless ERC-4337 = stretch.
- [x] Club demo: **ficticio** — "Deportivo San Martín" (predecible para el juez).
- [x] Pantallas: landing → club/ronda → wallet (invertir/cobrar) → panel club (distribute). Ver spec §7.
- [ ] Equipo: quién toma qué tier de integración WDK (MoonPay / Aave / Velora).

---

## Stack
- **Tether WDK** — wallets self-custody + pagos USD₮ (core). `@tetherto/wdk` + `@tetherto/wdk-wallet-evm`.
  Superficie explotada por tiers: wallet+transfer → Indexer → MoonPay → Price Rates → Velora → Aave.
- **USD₮** — unidad de cuenta de todo (funding, repartos, retiros). 6 decimales.
- **Smart contract** revenue-share — Solidity + OpenZeppelin (Foundry). Share = ERC-20, reparto
  claim-based (dividend accumulator). Chain: **EVM / Sepolia**.
- **Frontend** — Next.js (App Router, TS, Tailwind) + SQLite (Drizzle) + viem. Gas sponsor server-side.

Diseño completo: `docs/superpowers/specs/2026-07-05-la-doce-scaffold-design.md`.
Notas de la API de WDK: `docs/wdk-reference.md`. Convenciones: `CLAUDE.md`.

## Estructura
```
contracts/   Foundry + OZ — RevenueShareRound (ERC-20 share + claim), RoundFactory, MockUSDT + tests
web/         Next.js — pages, API routes, lib/ (wdk, contracts, indexer, moonpay, pricing, sponsor)
packages/abi/ ABIs compartidos contract → web
docs/        spec de diseño + referencia WDK
```

## Cómo correr

Requisitos: Node 20+, pnpm 10, [Foundry](https://getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

```bash
# 1. deps
pnpm install

# 2. contratos — build + tests (30/30)
pnpm contracts:build
pnpm contracts:test

# 3. web — DB local + dev server
cp web/.env.example web/.env.local     # ajustar si vas a testnet real (RPC key, USDT addr, SPONSOR_PK)
pnpm --filter web db:seed              # crea SQLite + club/ronda demo
pnpm web                               # http://localhost:3000

# (opcional) deploy a Sepolia:
cp contracts/.env.example contracts/.env
cd contracts && forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

### Demo 100% local (anvil — sin testnet, sin claves)

Loop real invest→distribute→claim sobre una cadena local:

```bash
pnpm install
anvil &                                                   # EVM local :8545 (chainId 31337)

# deploy MockUSDT + RoundFactory + ronda demo (usa la dev key #0 de anvil)
cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
# anota: MockUSDT, RoundFactory y "Demo round" del output

# apuntar web a anvil + esas addresses:
#   web/.env.local -> NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545, NEXT_PUBLIC_CHAIN_ID=31337,
#   NEXT_PUBLIC_USDT_ADDRESS=<MockUSDT>, SPONSOR_PK=<anvil #0>
#   y seed con la ronda deployada:
cd ../web
DEMO_ROUND_ADDRESS=<Demo round> DEMO_CLUB_WALLET=<Deployer> pnpm db:push && \
DEMO_ROUND_ADDRESS=<Demo round> DEMO_CLUB_WALLET=<Deployer> pnpm db:seed
pnpm dev                                                  # http://localhost:3000
```

`lib/chain.ts` resuelve la cadena viem (anvil vs Sepolia) por `NEXT_PUBLIC_CHAIN_ID`, así que el
mismo código corre local o en testnet sin tocar nada más.

El build corre out-of-the-box sin credenciales: cada integración WDK que necesita clave
(MoonPay, Indexer archivado, sponsor) degrada limpio si falta el env. Los `TODO(wire)` marcan
dónde falta la clave real.

## Por qué WDK + Ethereum

- **WDK** = la capa de dinero de Tether. La Doce ES flujo de dinero (fondeo, reparto, retiro en
  USD₮), así que el producto encaja natural en el track. Da wallets self-custody sin custodiar
  fondos (mata el riesgo regulatorio §6), USD₮ nativo, y UX sin fricción de gas. Explotamos su
  superficie (wallets, Indexer, MoonPay, Price Rates, Velora, Aave) → puntaje alto en el criterio
  "uso real de la plataforma".
- **Ethereum/EVM** = el contrato de reparto es el corazón del producto, y Solidity + OpenZeppelin
  lo hacen más rápido y seguro (patrones auditados) en un hackathon corto. USD₮ ERC-20 con la
  liquidez más profunda, ejecución barata en L2, y transparencia on-chain = la historia de confianza
  (lo que a Football Index le faltó).

## Licencia
MIT — ver [`LICENSE`](./LICENSE). Requisito de la hack (repo público + licencia permisiva).
