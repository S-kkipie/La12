import { Elysia } from "elysia";
import { listDirectoryRoute } from "./routes/list-directory.route";

export const directoryRouter = new Elysia({ prefix: "/directory" }).use(listDirectoryRoute);
