import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { z } from "zod";
import { ServerConfig } from "@/config/server-config";
import { auth, OpenAPI } from "@/server/auth/auth";
import {
  CommonResponse,
  successResponseSchema,
  type APIResponse,
  type STATUS_MAP,
} from "@/server/common/responses";
import { walletRouter } from "@/core/wallet/server/api/router";
import { accountRouter } from "@/core/account/server/api/router";
import { clubsRouter } from "@/core/clubs/server/api/router";

const apiErrorLogger = getLogger(["server", "error"]);

const betterAuth = new Elysia({ name: "better-auth" }).mount(auth.handler);

// OpenAPI docs (Scalar UI at /api/v1/openapi) are dev-only; mounted as an
// empty-typed sub-app so AppRouter stays identical across environments.
const docs = new Elysia({ name: "docs" });
if (ServerConfig.isDevelopment) {
  docs.use(
    openapi({
      documentation: {
        // Better Auth's generated schema (Path / OpenAPIModelSchema, from
        // better-auth/dist/plugins/open-api) doesn't structurally match the
        // openapi-types OpenAPIV3 shapes @elysiajs/openapi expects (e.g. its
        // `type: "json"` field isn't a valid OpenAPIV3 schema type). Cast at
        // the boundary — this is display-only (dev docs), no runtime effect.
        paths: (await OpenAPI.getPaths()) as never,
        components: (await OpenAPI.components) as never,
        info: {
          title: ServerConfig.info.name,
          version: ServerConfig.info.version,
          description: ServerConfig.info.description,
        },
      },
      mapJsonSchema: { zod: z.toJSONSchema },
    }),
  );
}

const app = new Elysia({ prefix: "/api/v1" })
  .use(betterAuth)
  .use(
    cors({
      origin: [ServerConfig.baseUrl],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(docs)
  .use(serverTiming())
  .use(elysiaLogger())
  .onError(({ error, code, request, path }) => {
    if (code === "VALIDATION") {
      // Elysia + zod: error.valueError is the first zod issue; its `path` is an
      // array of the failing field(s), e.g. ["address"]. (The reference uses
      // TypeBox where path is a string — that shape doesn't apply here.)
      const valueError = (error as { valueError?: { path?: unknown } }).valueError;
      const targets = Array.isArray(valueError?.path)
        ? (valueError.path as unknown[]).map(String)
        : undefined;
      return {
        code,
        status: (error as { status?: number }).status as keyof typeof STATUS_MAP,
        response: valueError,
        targets,
      } satisfies APIResponse<unknown>;
    }
    if (code === "NOT_FOUND") return { code: "NOT_FOUND", status: 404 } satisfies APIResponse;
    apiErrorLogger.error("Unhandled API error {code} on {method} {path}: {error}", {
      code,
      method: request.method,
      path,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    return { code: "INTERNAL_SERVER_ERROR", status: 500 } satisfies APIResponse;
  })
  // Health probe — the P0b integration proof (no domain routers yet).
  .get("/health", ({ status }) => status(200, CommonResponse.successful({ response: { ok: true } })), {
    response: { 200: successResponseSchema(z.object({ ok: z.boolean() }), "Health") },
    detail: { tags: ["Common"], summary: "Liveness probe" },
  })
  .use(walletRouter)
  .use(accountRouter)
  .use(clubsRouter);

export default app;
export type AppRouter = typeof app;
