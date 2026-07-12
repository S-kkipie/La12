import { Elysia } from "elysia";
import { getPositionsRoute } from "./routes/get-positions.route";
import { getHistoryRoute } from "./routes/get-history.route";

export const walletRouter = new Elysia({ prefix: "/wallet" })
  .use(getPositionsRoute)
  .use(getHistoryRoute);
