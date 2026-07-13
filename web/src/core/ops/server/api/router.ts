import { Elysia } from "elysia";
import { faucetRoute } from "./routes/faucet.route";
import { faucetUsdtRoute } from "./routes/faucet-usdt.route";
import { moonpayRoute } from "./routes/moonpay.route";
import { syncRoute } from "./routes/sync.route";

export const opsRouter = new Elysia({ prefix: "/ops" })
  .use(faucetRoute)
  .use(faucetUsdtRoute)
  .use(moonpayRoute)
  .use(syncRoute);
