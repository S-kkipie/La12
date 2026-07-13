import { Elysia } from "elysia";
import { listRoundsRoute } from "./routes/list-rounds.route";
import { createRoundRoute } from "./routes/create-round.route";
import { closeCheckRoute } from "./routes/close-check.route";

export const roundsRouter = new Elysia({ prefix: "/rounds" })
  .use(listRoundsRoute)
  .use(createRoundRoute)
  .use(closeCheckRoute);
