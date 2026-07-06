# Verificación out-of-the-box + condiciones de aprobación

Guía para que un juez (o cualquiera) corra **La Doce** desde cero y confirme que funciona.
Cada paso tiene una **condición de aprobación** explícita (✅ PASA / ❌ FALLA). Si todas pasan,
la entrega está verificada.

El camino por defecto es **modo `standard` sobre anvil local** — corre sin cuentas externas ni
claves. El modo **gasless (Sepolia + Candide)** es un extra opcional, documentado aparte en
[`candide-gasless-setup.md`](./candide-gasless-setup.md), y NO es necesario para aprobar.

---

## 0. Requisitos

- Node 20+
- pnpm 10
- [Foundry](https://getfoundry.sh): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
  - Asegurar el PATH: `export PATH="$HOME/.foundry/bin:$PATH"`

**✅ PASA si:** `node -v` ≥ 20, `pnpm -v` ≥ 10, `forge --version` y `anvil --version` responden.

---

## 1. Instalar

```bash
git clone https://github.com/S-kkipie/La12.git
cd La12
pnpm install
```

**✅ PASA si:** `pnpm install` termina con exit 0, sin errores de dependencias.

---

## 2. Contratos: build + tests

```bash
export PATH="$HOME/.foundry/bin:$PATH"
pnpm contracts:build
pnpm contracts:test
```

**✅ PASA si:**
- `contracts:build` compila sin errores.
- `contracts:test` = **30/30 tests en verde** (RevenueShareRound, RoundFactory, MockUSDT).

**❌ FALLA si:** cualquier test rojo o error de compilación.

---

## 3. Levantar cadena local + desplegar

En una terminal:
```bash
export PATH="$HOME/.foundry/bin:$PATH"
anvil                                    # nodo local en :8545, deja corriendo
```

En otra terminal (desde la raíz del repo):
```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Anotar de la salida: **MockUSDT**, **RoundFactory**, **Demo round**.

**✅ PASA si:** el deploy imprime las 3 direcciones y termina con exit 0.

---

## 4. Configurar la web + seed

`web/.env.local` (los valores de anvil son claves de dev públicas, LOCAL ONLY):
```bash
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_USDT_ADDRESS=<MockUSDT del paso 3>
NEXT_PUBLIC_ROUND_FACTORY=<RoundFactory del paso 3>
DEMO_ROUND_ADDRESS=<Demo round del paso 3>
DEMO_CLUB_WALLET=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
SPONSOR_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SPONSOR_FUND_WEI=2000000000000000
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

> **Importante (bug conocido, ya resuelto):** `db/seed.ts` ahora carga `.env.local`
> automáticamente (Node ≥20.12 `process.loadEnvFile`). Antes, correr `pnpm db:seed` sin
> exportar las vars seedeaba la ronda con una dirección **placeholder** (`0x…00D3`) sin
> código → los invest parecían pasar pero no minteaban shares. Si ves ese address en la DB,
> reseedeá con el `.env.local` correcto.

```bash
cd web
pnpm db:push        # crea el SQLite
pnpm db:seed        # club + ronda demo (lee .env.local)
```

**✅ PASA si:** `db:seed` imprime `seeded club:` y `seeded round:`, y la ronda usa el
`DEMO_ROUND_ADDRESS` real (no `0x…00D3`). Verificar:
```bash
node -e "const d=require('better-sqlite3')('ladoce.db');console.log(d.prepare('SELECT contract_address FROM rounds').all())"
```

---

## 5. Correr la app

```bash
pnpm --filter web dev        # http://localhost:3000
```

**✅ PASA si:** `http://localhost:3000` responde 200 y carga el landing.

---

## 6. Flujo funcional (el corazón de la demo)

Ver la guía detallada en [`flujo-inversion.md`](./flujo-inversion.md). Verificación mínima:

1. Signup como **fan** → se crea wallet self-custody en el browser.
2. Fondear con el faucet de USD₮ de prueba.
3. Invertir en la ronda del club.
4. (Como club) distribuir un ingreso.
5. (Como fan) cobrar el revenue.

**✅ PASA si — verificado on-chain, no solo en la UI:**
- Tras invertir: `shares balanceOf(fan) > 0` y `totalRaised` subió por el monto.
- Tras distribuir: `pendingReward(fan) > 0`.
- Tras cobrar: el USD₮ del fan sube y `pendingReward(fan)` vuelve a ~0.

Comandos de verificación on-chain:
```bash
export PATH="$HOME/.foundry/bin:$PATH"
RPC=http://127.0.0.1:8545 ; ROUND=<demo round> ; FAN=<address del fan>
cast call $ROUND "balanceOf(address)(uint256)" $FAN --rpc-url $RPC       # shares
cast call $ROUND "totalRaised()(uint256)" --rpc-url $RPC
cast call $ROUND "pendingReward(address)(uint256)" $FAN --rpc-url $RPC
```

---

## 7. Calidad (opcional pero recomendado)

```bash
pnpm --filter web lint
pnpm --filter web build      # una sola build, sin dev corriendo, rm -rf web/.next antes
```

**✅ PASA si:** lint limpio y build = **37/37 páginas estáticas**, exit 0.

> **Nota:** `next build` es inestable si corren builds concurrentes o `dev` comparte
> `web/.next`. Correr **una** build, con `dev` apagado y `rm -rf web/.next` antes.

---

## Resumen de aprobación

| # | Check | Condición |
|---|-------|-----------|
| 1 | Install | exit 0 |
| 2 | Contratos | 30/30 tests verdes |
| 3 | Deploy local | 3 addresses impresas |
| 4 | Seed | ronda con address real (no `0x…00D3`) |
| 5 | App boot | :3000 → 200 |
| 6 | Flujo | invest/distribute/claim verificados **on-chain** |
| 7 | Build/lint | 37/37, lint limpio |

**Entrega verificada = del 1 al 6 en verde** (el 7 es sello de calidad).
El modo gasless sobre Sepolia es un plus opcional, no condición de aprobación.
