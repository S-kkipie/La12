import { Elysia } from "elysia";
import { linkWalletRoute } from "./routes/link-wallet.route";

export const accountRouter = new Elysia({ prefix: "/account" }).use(linkWalletRoute);
