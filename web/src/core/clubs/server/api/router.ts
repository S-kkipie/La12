import { Elysia } from "elysia";
import { overviewRoute } from "./routes/overview.route";
import { distributionsRoute } from "./routes/distributions.route";
import { holdersRoute } from "./routes/holders.route";

export const clubsRouter = new Elysia({ prefix: "/clubs" })
  .use(overviewRoute)
  .use(distributionsRoute)
  .use(holdersRoute);
