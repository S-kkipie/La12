# Candide gasless setup — prueba ERC-4337 en Sepolia (gas en token)

Pasos para completar la **prueba gasless en vivo** (plan task 6): un hincha invierte pagando
el gas en un token, con **0 ETH** en su wallet. El código ya soporta `erc4337`
(`NEXT_PUBLIC_WALLET_MODE=erc4337`); esto es solo el provisioning externo de Candide.

## Por qué no sirve nuestro MockUSDT
El token paymaster de Candide **solo paga gas en tokens que él soporta** (USDC/USDT reales en
mainnet, o su test token **CTT** en Sepolia). Nuestro `MockUSDT` desplegado es un ERC-20 random →
el paymaster no lo acepta. Para la prueba testnet hay que usar **CTT**.

- CTT (Candide Test Token, Sepolia): `0xFa5854FBf9964330d761961F46565AB7326e5a3b`
- Verificar decimales de CTT antes de fijar params de ronda: `cast call 0xFa58…5a3b "decimals()(uint8)" --rpc-url <sepolia>`. Nuestro contrato asume **6 decimales** (como USD₮). Si CTT no es 6, ajustar `goal`/`sharePriceUsdt` de la ronda a los decimales de CTT.

## Contratos ya desplegados en Sepolia (chainId 11155111)
- MockUSDT (no usar para gasless) `0x35ad29decbD26AF79fE917198130815FAe74075e`
- RoundFactory `0x9b4db438aE2A73Ce8b2A7Ad8c90128f4B82dE98d`
- Ronda demo (MockUSDT) `0x0904FE03Ab8ABE4D5BCf77439Abc05f25a74d0F1`
- Deployer/Club `0x3C8B7386Fc544162b220cAdb605ECbdfaC4eE8D0` (key en `contracts/.env`, gitignored)

## Pasos

### 1. API key de Candide
- Crear cuenta gratis en `https://dashboard.candide.dev`.
- Crear un proyecto/gas-policy para **Sepolia** y copiar la **API key**.
- Endpoints Sepolia: bundler + paymaster = `https://api.candide.dev/public/v3/sepolia`
  (con API key pasa a la forma con key según su dashboard — usar la que te dé).

### 2. Desplegar una ronda que use CTT
La ronda actual apunta a MockUSDT. Crear una nueva en el factory con `usdtToken = CTT`:
```bash
cd contracts && set -a && . ./.env && set +a
# Ajustar goal/sharePrice a los decimales reales de CTT (ej. si 18 dec: goal=40000e18)
cast send 0x9b4db438aE2A73Ce8b2A7Ad8c90128f4B82dE98d \
  "createRound(string,string,address,address,uint256,uint256,uint256,uint256,uint256)" \
  "Deportivo San Martin CTT" "DSM-CTT" \
  0xFa5854FBf9964330d761961F46565AB7326e5a3b $CLUB_ADDRESS \
  40000000000 1000000 800 15000 2000000000 \
  --private-key $DEPLOYER_PK --rpc-url $SEPOLIA_RPC_URL
# leer la address nueva:
cast call 0x9b4db438aE2A73Ce8b2A7Ad8c90128f4B82dE98d "rounds()(address[])" --rpc-url $SEPOLIA_RPC_URL
```

### 3. Configurar la web en modo erc4337 (Sepolia)
En `web/.env.local` (gitignored):
```bash
NEXT_PUBLIC_WALLET_MODE=erc4337
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_USDT_ADDRESS=0xFa5854FBf9964330d761961F46565AB7326e5a3b   # CTT
NEXT_PUBLIC_ROUND_FACTORY=0x9b4db438aE2A73Ce8b2A7Ad8c90128f4B82dE98d
DEMO_ROUND_ADDRESS=<ronda CTT del paso 2>
NEXT_PUBLIC_BUNDLER_URL=https://api.candide.dev/public/v3/sepolia
NEXT_PUBLIC_PAYMASTER_URL=https://api.candide.dev/public/v3/sepolia
NEXT_PUBLIC_PAYMASTER_ADDRESS=<paymaster address de Candide Sepolia — del dashboard/docs>
NEXT_PUBLIC_SAFE_MODULES_VERSION=0.3.0
# si Candide exige API key en la URL, usar la forma con key que te dé el dashboard
```
Reseedear la DB con la ronda CTT (`DEMO_ROUND_ADDRESS=… pnpm --filter web db:push && … db:seed`).

### 4. Fondear la smart account con CTT (NO con ETH)
- Signup de un fan en la app → copiar su **smart-account address** (la que muestra `/wallet`).
- Conseguir CTT del faucet de Candide y mandárselo a esa address. **Mandarle 0 ETH** (ese es el punto).

### 5. Prueba gasless
- En el browser: invertir. Esperado: approve + invest salen como **UserOperations**; el CTT de la
  smart account baja por el monto invertido **+ un fee de gas en CTT** cobrado por el paymaster;
  el ETH de la smart account queda en **0**.
- Confirmar en un explorer (la UserOp muestra el paymaster) + `cast balance <smartAccount>` == 0.
- Capturar: hash de la UserOp / link al explorer + balances CTT y ETH antes/después = evidencia mainnet.

### 6. Restaurar demo local
Volver `web/.env.local` a los valores de anvil/standard para que la demo local siga corriendo.

## Nota mainnet
En mainnet Candide **sí** soporta USD₮ nativo — ahí el flujo es idéntico pero con USD₮ real como
`paymasterToken`, sin CTT. Este doc es solo para la prueba en testnet.

## Fuentes
- Candide — pay gas in ERC-20: https://docs.candide.dev/wallet/guides/pay-gas-in-erc20/
- Candide — tokens soportados: https://docs.candide.dev/wallet/paymaster/tokens-supported/
- Candide — paymaster API: https://docs.candide.dev/wallet/paymaster/rpc-methods/
- WDK ERC-4337: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337
