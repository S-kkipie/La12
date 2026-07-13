# La Doce — Propuesta de valor y producto

> *"El jugador número 12 deja de ser espectador y pasa a ser dueño."*
> Compra un pedazo de los ingresos de tu club. Invertís en USD₮, cobrás en USD₮, tus llaves son tuyas.

---

## 1. En una frase (pitch de ascensor)

**La Doce es revenue-share tokenizado para clubes de fútbol.** Un club levanta capital de su propia
hinchada en USD₮ y, a cambio, comparte un porcentaje de un ingreso real (la taquilla) hasta un tope.
El hincha invierte, recibe un **token ERC-20 que ES su participación**, y cobra su parte de cada
reparto — todo en una wallet self-custody, sin banco y sin intermediario. Nosotros **nunca
custodiamos un centavo**.

---

## 2. El problema

Dos lados que nunca se pudieron conectar:

- **El club de barrio es un negocio real** — vende entradas, merch, tiene miles de hinchas leales.
  Pero **ningún banco le presta**. La única puerta que queda es el prestamista informal.
- **El hincha quiere poner plata y ganar junto a su club**, no solo hacer un aporte a fondo perdido.
  Nunca existió un **instrumento** que una las dos puntas.

Ese es el hueco. Y es un hueco de LatAm: negocios sin crédito + gente con ganas de invertir montos
chicos, sin acceso a dólares ni a mercados.

---

## 3. La propuesta de valor

- **Para el club:** capital de trabajo levantado de su activo más leal — la hinchada — sin banco, sin
  garantías, sin ceder control (es revenue-share, no acciones). El capital llega **en segundos, on-chain.**
- **Para el hincha:** invierte desde un ticket chico, en **USD₮** (dólar digital, sin cuenta bancaria,
  cross-border), recibe un **token que puede tener, mostrar y —a futuro— vender**, y cobra dividendos
  **automáticos y pro-rata** cada vez que hay ingreso. Por amor **y** por retorno.
- **El que mata el cold-start:** todo marketplace muere por falta de una punta. Acá la punta ya existe
  y es apasionada — **el banco no banca al club del barrio, pero el hincha sí.**

---

## 4. El producto — qué hace

Dos roles, un contrato en el centro.

**Flujo del club:**
1. Crea una **ronda de financiamiento** (meta en USD₮, % de ingresos compartido, tope/cap, fecha límite).
2. Cuando la ronda llena, el USD₮ recaudado **se barre al club automáticamente, on-chain** — nadie aprieta un botón.
3. Cuando entra ingreso (la taquilla), el club **distribuye**: el contrato retiene el % pactado y lo
   parte **pro-rata entre todos los holders**.

**Flujo del hincha:**
1. Se registra con email → **aparece una wallet self-custody** (sin ver seed, ni red, ni gas — se siente como app de pagos).
2. Fondea en USD₮ (tarjeta vía MoonPay, o faucet de prueba en el demo).
3. Explora el **directorio de clubes** levantando capital, abre una ronda.
4. **Invierte** → su USD₮ entra al contrato de la ronda y recibe su **token ERC-20 (su participación)** en su propia wallet.
5. Cuando el club reparte, **reclama** su parte → USD₮ le llega a la wallet. Sin oráculo, sin confiar en nadie.

**Alrededor:** gas patrocinado (el hincha nunca ve ETH), dashboards para club y fan, on-ramp fiat,
historial real de movimientos.

---

## 5. Ejemplo concreto

**Deportivo San Martín** necesita **40.000 USD₮** para los reflectores. Ofrece **8% de la taquilla,
con tope de 1.5x**. Unos **400 hinchas** ponen ~100 USD₮ cada uno. Desde ahí, **cada fecha** cobran
su parte, automática, en USD₮ — hasta que se llega al tope. El club se financió con su gente; la
gente gana con su club.

---

## 6. Por qué revenue-share y NO acciones (clave)

El instrumento son **derechos económicos** sobre un flujo de ingresos, **no equity**. Esto es
deliberado y es lo que lo hace viable:

- **No custodiamos** fondos ni llaves (self-custody total).
- **No es un valor/security** en el sentido societario — no se vende propiedad de la empresa, se
  comparte un ingreso hasta un tope, on-chain y transparente.
- El club **no cede control** ni asiento en la mesa; el hincha **no asume pasivos** del club.

Mantener esta línea es parte del diseño, no un detalle.

---

## 7. Diferenciador — por qué ganamos

Somos el **único** proyecto del campo con un **instrumento financiero real**: un contrato propio
`RevenueShareRound` (share ERC-20 + acumulador de dividendos estilo MasterChef, cap y refund
forzados on-chain, transferible por liquidación de reward-debt, **30/30 tests adversariales**) +
**ERC-4337 gasless genuinamente cableado** (gas pagado en USD₮ vía paymaster). El resto del campo es
wallet + transferencia de USD₮. Esa ambición es nuestro **moat**.

**Principio rector:** *nunca la promesa supera al código.* Un solo stub descubierto en code-review
envenena todas las demás afirmaciones. Ganamos **entregando más de lo que prometemos.**

---

## 8. Visión — más allá del fútbol

El fútbol es la **cabeza de playa**. El mismo motor es un **mercado de capitales privado para LatAm**:
cualquier negocio chico levanta capital, cualquiera invierte desde un ticket chico, los dividendos
caen en USD₮, y la blockchain es invisible. Y como la participación **ya es un ERC-20**, se abre un
**mercado secundario sin reescribir un contrato** — el hincha puede comprar y vender su participación.
*"Football Index — pero real, on-chain, self-custody, y con mercado secundario que funciona."*

---

## 9. Estado actual (honesto)

- **Construido y funcionando:** contratos (RevenueShareRound + RoundFactory + MockUSDT, 30/30 tests),
  desplegados en Sepolia; wallet self-custody WDK (seed cifrada en el browser); loop completo
  **invertir → auto-close/sweep → distribuir → reclamar** probado; dashboards de club y fan;
  directorio de clubes; on-ramp MoonPay firmado; gas sponsor; ERC-4337 dual-mode en código.
  Arquitectura backend migrada a un tri-layer limpio (Elysia + Eden), tipada de punta a punta.
- **En curso / roadmap:** Price Rates (valor en fiat, cableándose), mercado secundario P2P (flagship),
  "invertir con cualquier token" (swap Velora), el float de la ronda rindiendo en Aave. Marcados como
  roadmap, no como hecho.
