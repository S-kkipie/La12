# La Doce — Tether / WDK: cómo lo usamos y por qué

> Versión pitch/negocio (español). La versión técnica para el code-review de los jueces, con
> permalinks al código, está en `TETHER_STACK.md` (inglés). Este archivo es la **narrativa** y la
> **munición para el pitch y el demo**.

---

## 1. La tesis: USD₮ no es un detalle, es el producto

La Doce no "usa cripto". La Doce usa **USD₮ como unidad de cuenta de todo**: se invierte en USD₮, el
club se financia en USD₮, los dividendos se cobran en USD₮. Para un hincha de LatAm —inflación,
sin acceso fácil a dólares, sin cuenta que aguante— **un dólar digital, global, sin banco y
cross-border es exactamente el instrumento que faltaba.** Sacá USD₮ y no hay producto.

Y no lo pegamos encima: **construimos nativos del stack Tether (WDK).** Cada decisión de producto
mapea a una pieza del stack.

---

## 2. Por qué WDK (y no rollear lo nuestro)

Necesitábamos **self-custody sin fricción** (el hincha es dueño de sus llaves, pero no debería ni
enterarse de que existe una "seed") **+ un stack completo** (wallet, transferencias, historial,
on-ramp fiat, precios, swap, lending). WDK da las dos cosas: no reinventamos gestión de llaves ni
integraciones de pago, y usamos **más superficie del stack, de verdad**, no un solo endpoint.

---

## 3. Pieza por pieza — qué aporta al producto y cómo la cableamos

Formato que premian los jueces: **por qué la elegimos · cómo la cableamos · el trade-off.**

### 🔑 Wallet self-custody (WDK Wallet EVM + Core) — tier 1
- **Por qué:** el hincha debe ser dueño de su plata, y **el servidor nunca debe poder moverla.**
- **Cómo:** la seed se genera en el browser, se **cifra con AES-GCM con una `CryptoKey` no-extractable**
  y vive en IndexedDB — nunca sale del dispositivo, el servidor nunca la ve. Una wallet por usuario.
- **Trade-off:** la llave queda atada al navegador (custodia fuerte); la recuperación va por
  export/import → roadmap: recuperación social vía ERC-4337.
- **Frase de demo:** *"Me registré con un email. Detrás, WDK me creó una wallet self-custody y cifró la
  seed en mi browser. Fijate lo que NO vi: seed, red, token de gas. Se siente como una app de pagos."*

### 💸 Transferencias USD₮ — tier 1
- **Por qué:** invertir y cobrar son transferencias de USD₮; es el corazón del loop.
- **Cómo:** la cuenta WDK maneja `transfer`/balance de USD₮ (6 decimales, montos en base-unit `bigint`,
  sin pérdida de precisión). Un solo `WalletHandle` esconde EOA vs smart-account.
- **Trade-off:** disciplina de `bigint` de punta a punta (más ceremonia que floats) para no perder ni un centavo.

### ⛽ Gas patrocinado + ERC-4337 gasless — tier 1 (el UX killer)
- **Por qué:** un hincha nuevo llega con **cero ETH**. Que tenga que "conseguir gas" mata la conversión.
- **Cómo:** modo local, un relayer del servidor le manda un poco de ETH (approach B: **solo gasta su
  propio ETH, nunca la llave del hincha**); modo mainnet, **smart-account Safe que paga el gas en USD₮**
  vía paymaster (ERC-4337). Un `WalletHandle` unifica ambos.
- **Seguridad:** el relayer es una cuenta con fondos reales → **faucet sin límite = vector de drenaje**;
  por eso cada endpoint está **rate-limited por dirección** (1 llamada/hora, buckets independientes).
- **Trade-off:** la prueba gasless en vivo depende de aprovisionar el paymaster (Candide); el camino de
  código está completo y verificado.
- **Frase de demo:** *"El hincha nunca ve ETH. En mainnet, el gas se paga en USD₮."*

### 📜 Indexer API — tier 2
- **Por qué:** historial de USD₮ real, rápido, sin escanear la cadena a mano.
- **Cómo:** REST al Indexer hosteado (`x-api-key`, server-only) **con fallback a `getLogs` de viem**, así
  el historial **nunca queda vacío** aunque no haya API key.
- **Trade-off:** el fallback subcuenta en rondas muy viejas (ventana de bloques) — degradación aceptada, documentada.

### 💳 MoonPay (on-ramp fiat) — tier 3
- **Por qué:** derriba la barrera "primero andá a conseguir cripto". El hincha fondea **con tarjeta**.
- **Cómo:** URL del widget de MoonPay **firmada con HMAC en el servidor** (el secreto nunca llega al cliente).
- **Trade-off:** URL firmada en vez de SDK completo — integración correcta más rápida; reconciliación por webhook = roadmap.

### 📈 Price Rates (valor en fiat) — tier 4
- **Por qué:** el hincha piensa en su moneda local; ver el saldo en USD/EUR/GBP.
- **Cómo:** `@tetherto/wdk-pricing-bitfinex-http` (Bitfinex), server-side + cache; **USD = 1.0 (peg), y si
  falla el rate degradamos a 1.0 marcado como aproximado** — nunca un número foráneo inventado.
- **Trade-off:** USD₮≈USD, así que es **polish de UX, no matemática de plata** — por eso el modo de falla
  es "mostrá USD", no romper la página. *(En curso; hasta que aterrice, es un stub 1:1 declarado como tal.)*

### 🔁 Velora (swap) — tier 5 · roadmap con historia
- **Idea:** *"invertí con cualquier token"* — el hincha trae cualquier token, se swapea a USD₮ y se
  invierte, **batcheado en un solo UserOp ERC-4337** (firma una vez, gas en USD₮). Diseño en
  `docs/superpowers/specs/2026-07-12-p8-velora-swap-slice-design.md`.

### 🏦 Aave (lending) — tier 6 · roadmap con historia
- **Idea:** *"tu plata trabaja antes de que arranque la temporada"* — el float de la ronda **rinde en
  Aave mientras se llena**; al cerrar, el capital respalda los shares 1:1 y **el yield se reparte a los
  holders** como bonus. Diseño en `docs/superpowers/specs/2026-07-12-p9-aave-lending-slice-design.md`.

---

## 4. "Nativos del stack, no pegado encima"

| Decisión de producto | Pieza Tether |
|---|---|
| El hincha es dueño de su plata, cero fricción | Wallet self-custody + gasless (ERC-4337) |
| Invertir y cobrar sin banco, cross-border | USD₮ + transferencias |
| Fondear sin tener cripto | MoonPay on-ramp |
| Ver "cuánto tengo" en mi moneda | Price Rates |
| Historial confiable de mis movimientos | Indexer |
| (roadmap) invertir con cualquier token | Velora swap |
| (roadmap) que el capital rinda mientras espera | Aave lending |

**Honestidad de scope (regla de oro):** mejor pocas piezas **de verdad cableadas con su trade-off** que
una lista larga de "lo importamos". Velora y Aave van marcados como roadmap **con diseño concreto**, no
como hecho.

---

## 5. Recordatorio del formato que puntúan los jueces

Para cada pieza, en el pitch y en el doc técnico decir siempre las **tres**:
1. **Por qué la elegimos** (el problema de negocio que resuelve).
2. **Cómo la cableamos** (concreto, con el archivo/línea).
3. **El trade-off** que aceptamos.

*"La usamos" puntúa muy por debajo de "la elegimos por X, la cableamos como Y, y aceptamos el trade-off Z."*

---

## 6. Punteo rápido para el demo (qué decir en cada paso)

1. **Sign up → wallet:** "WDK generó una wallet self-custody, seed cifrada en mi browser. No vi seed, ni red, ni gas."
2. **Fondear (faucet/MoonPay):** "Fondeo en USD₮ — con tarjeta vía MoonPay, o faucet en el demo."
3. **Directorio → ronda:** "El marketplace de clubes levantando capital ahora."
4. **Invertir → recibo el token:** "Mi USD₮ entra al contrato, recibo un ERC-20 que es mi participación, en MI wallet."
5. **Auto-close → sweep:** "La ronda llenó — el USD₮ se barrió al club, automático, on-chain. Nadie apretó un botón."
6. **Distribuir → reclamar (el wow):** "El club reparte, el contrato parte pro-rata a cada holder, y yo reclamo. USD₮ a mi wallet. Sin oráculo, sin confiar en nadie. Todo en USD₮."
