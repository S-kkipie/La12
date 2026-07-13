import { Elysia } from "elysia";
import { rateRoute } from "./routes/rate.route";

export const pricingRouter = new Elysia({ prefix: "/pricing" }).use(rateRoute);
