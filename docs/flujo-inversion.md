# Flujo de inversión correcto — 20 fans → club → revenue → fans

El ciclo completo de La Doce, end-to-end, con la matemática exacta y un **script reproducible**
de 20 fans sobre anvil. Sirve como prueba funcional y como base del guion de la demo.

---

## 1. El ciclo (qué pasa on-chain)

```
Funding ───invest×N──▶ (meta o deadline) ───closeFunding──▶ Active ───distribute──▶ (holders acreditados)
   │                                             │                                        │
 fans ponen USD₮                        club recibe TODO                          fans hacen claim
 reciben shares                         lo recaudado                              cobran su parte
```

| Fase | Quién | Función | Qué hace |
|------|-------|---------|----------|
| **Funding** | fan | `approve(round, monto)` → `invest(monto)` | Mintea `shares = monto·1e6 / sharePriceUsdt`. Sube `totalRaised`. |
| **Cierre** | cualquiera | `closeFunding()` | Cuando `totalRaised ≥ goal` **o** pasó el `deadline`: barre **todo** el USD₮ al club. Estado → Active. |
| **Reparto** | club | `approve(round, revenue)` → `distribute(revenue)` | Acredita `revenueBps%` a holders (hasta el cap), reembolsa el resto al club. Sube `accRewardPerShare`. |
| **Cobro** | fan | `claim()` | Paga el `pendingReward` pro-rata en USD₮. |
| **Retiro** | club | `closeRound()` | Opcional: retira la ronda, bloquea `distribute` (el `claim` sigue). |

**Parámetros de la ronda** (inmutables, se fijan al crear):
- `goal` — meta de recaudación.
- `sharePriceUsdt` — USD₮ por share (6 dec).
- `revenueBps` — % de cada ingreso que va a holders (`800` = 8%).
- `capMultiple` — tope de reparto lifetime = `totalRaised · capMultiple / 10000` (`15000` = 1.5×).
- `deadline` — fin de la ventana de funding.

---

## 2. La matemática (ejemplo de la demo)

Ronda: `goal = 40.000 USD₮`, `sharePrice = 1 USD₮`, `revenueBps = 800` (8%), `capMultiple = 15000` (1.5×).

**Funding — 20 fans, 2.000 USD₮ cada uno:**
- Cada fan: `2000 · 1e6 / 1e6 = 2000` shares.
- `totalRaised = 40.000` · `totalSupply = 40.000` shares.
- Cada fan tiene el **5%** (2000/40000).
- Al `closeFunding`: el club recibe **40.000 USD₮**.

**Reparto — el club distribuye 10.000 USD₮ de ingreso:**
- `holderCut = 10.000 · 800/10000 = 800 USD₮` a repartir entre holders.
- Reembolso al club = `10.000 − 800 = 9.200 USD₮`.
- Cada fan cobra `800 · 5% = 40 USD₮`.

**Tope lifetime:** `cap = 40.000 · 1.5 = 60.000 USD₮` totales a holders. Cuando la suma de
`holderCut` acreditados llega a 60.000, los repartos siguientes reembolsan 100% al club.

---

## 3. Script reproducible (20 fans, anvil)

Prueba el ciclo completo sin browser. Requiere `~/.foundry/bin` en el PATH.

### 3.1 Arrancar anvil con 25 cuentas fondeadas

```bash
export PATH="$HOME/.foundry/bin:$PATH"
anvil --accounts 25 --balance 1000        # deja corriendo; indices 0..24, todas con ETH
```

### 3.2 Desplegar contratos

En otra terminal:
```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
Anotar **MockUSDT** y **RoundFactory**.

### 3.3 Correr el flujo

Pegar en la terminal (ajustar `USDT` y `FACTORY` con las direcciones del deploy):

```bash
export PATH="$HOME/.foundry/bin:$PATH"
RPC=http://127.0.0.1:8545
MN="test test test test test test test test test test test junk"
USDT=<MockUSDT>
FACTORY=<RoundFactory>

CLUB_PK=$(cast wallet private-key "$MN" 0)
CLUB=$(cast wallet address --private-key $CLUB_PK)
DEADLINE=$(($(date +%s) + 7776000))   # +90 días

# --- Crear la ronda: goal 40k, price 1, 8%, cap 1.5x ---
cast send $FACTORY \
  "createRound(string,string,address,address,uint256,uint256,uint256,uint256,uint256)" \
  "Deportivo San Martin" "DSM" $USDT $CLUB \
  40000000000 1000000 800 15000 $DEADLINE \
  --private-key $CLUB_PK --rpc-url $RPC > /dev/null
ROUND=$(cast call $FACTORY "rounds()(address[])" --rpc-url $RPC | tr -d '[]' | tr ',' '\n' | tail -1 | xargs)
echo "ROUND=$ROUND"

# --- 20 fans invierten 2.000 USD₮ cada uno (indices 1..20) ---
for i in $(seq 1 20); do
  PK=$(cast wallet private-key "$MN" $i)
  FAN=$(cast wallet address --private-key $PK)
  cast send $USDT  "mint(address,uint256)" $FAN 2000000000 --private-key $CLUB_PK --rpc-url $RPC > /dev/null
  cast send $USDT  "approve(address,uint256)" $ROUND 2000000000 --private-key $PK --rpc-url $RPC > /dev/null
  cast send $ROUND "invest(uint256)" 2000000000 --private-key $PK --rpc-url $RPC > /dev/null
  echo "fan $i ($FAN) invirtió 2000 USD₮"
done
echo "totalRaised = $(cast call $ROUND 'totalRaised()(uint256)' --rpc-url $RPC)"   # 40000000000

# --- El club cierra funding y RECIBE todo lo recaudado ---
cast send $ROUND "closeFunding()" --private-key $CLUB_PK --rpc-url $RPC > /dev/null
echo "USD₮ del club tras cierre = $(cast call $USDT 'balanceOf(address)(uint256)' $CLUB --rpc-url $RPC)"

# --- El club distribuye 10.000 USD₮ de ingreso ---
cast send $USDT  "mint(address,uint256)" $CLUB 10000000000 --private-key $CLUB_PK --rpc-url $RPC > /dev/null
cast send $USDT  "approve(address,uint256)" $ROUND 10000000000 --private-key $CLUB_PK --rpc-url $RPC > /dev/null
cast send $ROUND "distribute(uint256)" 10000000000 --private-key $CLUB_PK --rpc-url $RPC > /dev/null

# --- Cada fan cobra su revenue (≈ 40 USD₮ c/u) ---
FAN1=$(cast wallet address --private-key $(cast wallet private-key "$MN" 1))
echo "pendingReward fan 1 (antes) = $(cast call $ROUND 'pendingReward(address)(uint256)' $FAN1 --rpc-url $RPC)"  # 40000000
for i in $(seq 1 20); do
  PK=$(cast wallet private-key "$MN" $i)
  cast send $ROUND "claim()" --private-key $PK --rpc-url $RPC > /dev/null
done
echo "USD₮ fan 1 tras claim = $(cast call $USDT 'balanceOf(address)(uint256)' $FAN1 --rpc-url $RPC)"  # 40000000 (40 USD₮)
```

### 3.4 Condiciones de aprobación del script

| Check | Esperado |
|-------|----------|
| `totalRaised` tras 20 invests | `40000000000` (40.000 USD₮) |
| USD₮ del club tras `closeFunding` | `40000000000` |
| `pendingReward` fan 1 tras `distribute` | `40000000` (40 USD₮) |
| USD₮ fan 1 tras `claim` | `40000000` |
| `pendingReward` fan 1 tras `claim` | `0` |

Si los 5 dan esos valores, el ciclo **invest → club recibe → club distribuye → fans cobran**
está probado end-to-end.

---

## 4. El mismo flujo por la UI (para la demo en video)

No hace falta hacer 20 signups. Para el video alcanza con **1–2 fans**:

1. **Fan** → signup → wallet self-custody creada en el browser.
2. Faucet de USD₮ de prueba → invertir en `/club/deportivo-san-martin`.
3. Cambiar a la cuenta **club** → `/dashboard` → **Distribute** un ingreso.
4. Volver al **fan** → `/wallet` → Positions muestra la posición → **Claim** el revenue.
5. Activity refleja los movimientos.

Los 20 fans se cuentan en el pitch ("400 hinchas × 100 USD₮"); en pantalla mostrás el mecanismo
con uno o dos y los números on-chain reales.

---

## 5. Gasless (Sepolia + Candide) — el remate

El mismo `invest`/`claim`, pero en modo `erc4337`: la wallet es una smart-account Safe, el gas lo
paga el **paymaster en USD₮**, el fan tiene **0 ETH**. Setup en
[`candide-gasless-setup.md`](./candide-gasless-setup.md). Prueba ya realizada en Sepolia:

- Ronda: `0x53d582D84f86E94f9EeD4201236d3CfE1b6450d0` (USD₮ Candide, 6 dec).
- Invest verificado: `10 USD₮ → 10 shares`, gas cobrado en USD₮, ETH del fan = 0.
- tx `Invested`: `0x4d03720acbf4a32cbf4be34db422e97fcb98f46332e92ab5d04d6a4ed31683dd`.

Ese es el argumento fuerte para el criterio "uso real de WDK": self-custody + pago de gas en USD₮.

---

## 6. Errores comunes (aprendidos en la práctica)

- **Ronda con address placeholder (`0x…00D3`):** si `db:seed` corrió sin `.env.local`, la ronda
  apunta a una dirección sin código → los `invest` "pasan" pero no mintean shares. Ya resuelto:
  `seed.ts` carga `.env.local`. Verificar `contract_address` real en la DB antes de demostrar.
- **Invest sin `approve` previo:** `invest` hace `transferFrom` → revierte sin allowance. La UI
  hace el `approve` automático; en scripts hay que llamarlo explícito.
- **`closeFunding` antes de la meta:** solo pasa si `totalRaised ≥ goal` o venció el `deadline`.
- **`distribute` con `revenueBps` mal:** debe ser `0 < revenueBps ≤ 10000`. El contrato lo valida
  en el constructor.
