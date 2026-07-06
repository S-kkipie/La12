# La Doce ⚽ — Pitch

> **"Compra un pedazo de los ingresos de tu club. Inviertes en USD₮, cobras en USD₮, tus llaves son tuyas."**

**Track:** Tether WDK (wallets self-custody + pagos) · **Tema:** fútbol · **Deadline:** Jul 14 2026

---

## 1. El problema (real, con plata de verdad)

Los clubes de fútbol chicos — Liga 2, Copa Perú, barrio — **son MYPES**: generan ingresos (taquilla,
merch), tienen hinchas fieles, crecen. Pero **nadie les presta capital**. El banco no le presta al
club del barrio; solo quedan prestamistas caros. Y del otro lado: miles de hinchas quieren apoyar
(y ganar) pero **no hay forma de invertir en su club**.

Hay un vacío enorme entre el club y su gente, y no existe el instrumento para cruzarlo.

## 2. La solución

Un club emite **revenue-share tokenizado**: pide capital en USD₮ y a cambio reparte un % de un
ingreso visible (taquilla) por N meses, hasta un múltiplo cap. El hincha invierte USD₮, recibe un
**token ERC-20 = su participación**, y cobra su parte de cada reparto — todo en su **wallet
self-custody**. Sin banco, sin intermediario, sin que la plataforma custodie un centavo.

**El gancho que resuelve el arranque en frío:** el banco no le presta al club del barrio; **el
hincha sí** — invierte por amor + retorno. Eso mata el problema de confianza que hunde a todo
marketplace nuevo.

### Ejemplo
> Deportivo San Martín necesita **USD₮ 40,000** para reflectores.
> Emite revenue-share: **8% de la taquilla, cap 1.5×**.
> 400 hinchas invierten ~USD₮ 100 c/u. Cobran su parte cada partido, automático, en USD₮.

## 3. Cómo funciona (el demo)

**Dos tipos de cuenta (SaaS):**

**Hincha:** crea cuenta → wallet WDK embebida se crea sola (UX tipo Yape, sin seed en la cara) →
fondea USD₮ → invierte en la ronda del club → recibe token ERC-20 → cobra repartos → retira. Llaves
suyas siempre.

**Club:** crea cuenta → wallet WDK de cobro → publica ronda (meta, %, cap, plazo) → al llenar la
meta recibe el capital → dispara el reparto cuando entra la taquilla.

**Momento "wow":** el club reparte la recaudación → el contrato retiene el % pactado y lo reparte
**pro-rata a los holders automáticamente** → el USD₮ cae en la wallet del hincha. Sin oráculo, sin
confianza, todo on-chain, todo en USD₮.

## 4. Por qué WDK (criterio #5 — el que más pesa)

La Doce **es** flujo de dinero. WDK es la capa de dinero de Tether. El producto **es** el track.

- **Self-custody sin construir infra cripto** → mata el riesgo regulatorio (no custodiamos fondos).
- **UX tipo Yape** → wallet embebida, sin seed, sin fricción. Un hincha de barrio invierte sin saber
  qué es una blockchain.
- **USD₮ nativo** como unidad de cuenta de todo (fondeo, reparto, retiro).
- **Superficie WDK explotada:** wallet-evm (+ ERC-4337), y arquitectura lista para Indexer, MoonPay
  (on-ramp con tarjeta), Price Rates, Velora (swap), Aave (yield del capital ocioso).

## 5. Por qué Ethereum + gasless mainnet

- El **contrato de reparto es el corazón** del producto → Solidity + OpenZeppelin = patrones
  auditados, rápido y seguro. Share = ERC-20, reparto claim-based (dividend accumulator), gas-safe
  con N holders. **30/30 tests**, revisado adversarialmente (seguridad + contabilidad).
- **Gas en USD₮, cero ETH:** modo `erc4337` — el hincha paga el gas en el propio USD₮ vía paymaster
  (WDK ERC-4337). El "el hincha nunca toca otra moneda" no es marketing: es la config de producción.
  (Demo local usa un atajo de pre-fund; mainnet usa el paymaster.)

## 6. Qué está construido (estado real, sin humo)

| Pieza | Estado |
|---|---|
| Contrato revenue-share (Foundry + OZ) | ✅ 30/30 tests, hardened por review adversarial |
| Web SaaS (Next.js) — cuentas club + fan | ✅ Better Auth, roles gateados server-side |
| Wallet WDK self-custody (seed AES-GCM en browser, per-usuario) | ✅ real, no stub |
| Loop invest → distribute → claim | ✅ probado end-to-end en cadena local (anvil) |
| Wallet dual-mode (standard + ERC-4337 gasless) | ✅ código + revisado; contratos ya en Sepolia |
| Faucets de prueba (USD₮ + gas) | ✅ para correr sin plata real |
| Prueba gasless en vivo (Sepolia, gas en token) | ⬜ pendiente provisioning Candide (ver `docs/candide-gasless-setup.md`) |

## 7. Riesgo #1 — regulatorio (lo decimos antes que el juez)

Emitir "acciones" = entrar en regulación de valores. Por eso arrancamos con **revenue-share /
derechos económicos** (instrumento liviano, no-custodio) + **self-custody** (el usuario tiene sus
llaves, la plataforma no custodia fondos). Antecedente a NO repetir: **Football Index** colapsó por
ser gambling opaco sin propiedad real. Nosotros: **propiedad on-chain, transparente, self-custody**.

## 8. Visión a largo plazo

La Doce empieza por el fútbol (beachhead: clubes = MYPES con hinchas emocionalmente comprometidos),
pero el mismo motor sirve para **cualquier empresa privada del Perú y LATAM**: el mercado privado
digital donde cualquier negocio levanta capital y cualquier persona invierte desde montos chicos.
Blockchain invisible; dividendos en USD₮. El token ERC-20 ya deja la puerta abierta a un **mercado
secundario P2P** (liquidez) sin recodear el contrato.

## 9. Stack y servicios externos (regla de la hack)

**Nuestro código:**
- Contratos: Solidity + **OpenZeppelin**, **Foundry** (test/deploy). `RevenueShareRound` (ERC-20
  share + claim), `RoundFactory`, `MockUSDT`.
- Web: **Next.js** (App Router, TS), **Tailwind**, **Drizzle + SQLite**, **viem**.

**Plataforma del track:**
- **Tether WDK** — `@tetherto/wdk`, `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-wallet-evm-erc-4337`.

**Servicios / librerías de terceros:**
- **Better Auth** — auth email+password, sesiones.
- **Candide** — bundler + paymaster ERC-4337 (gas en token). *Solo para el modo gasless mainnet/testnet.*
- **sonner** — toasts. **zod** — validación.
- **MoonPay** — on-ramp fiat (integración stub, roadmap).
- RPC: publicnode (Sepolia). Chain: EVM (Ethereum/Sepolia).

## 10. Alineación con los criterios de evaluación (1–5)

- **Ambición técnica:** contrato dividend-accumulator + wallet dual-mode gasless (ERC-4337) + SaaS
  con auth y roles.
- **UX:** onboarding sin seed ni gas token, errores legibles, faucets de prueba, skin de fútbol.
- **Utilidad real:** financia MYPES que el banco ignora; instrumento no-custodio y no-valores.
- **Creatividad:** el hincha como inversor ("el jugador número 12"), cobro en la fuente automático.
- **Uso real de WDK:** el producto entero corre sobre wallets WDK + USD₮; gasless con WDK ERC-4337.

---

**Repo:** github.com/S-kkipie/La12 · **Licencia:** MIT · **Correr:** ver `README.md` (`## Cómo correr`)
