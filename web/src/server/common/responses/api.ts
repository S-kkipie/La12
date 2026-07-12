import { z } from "zod";
import type { ApiErrorStatus, ApiStatus } from "./status";
import { STATUS_MAP } from "./status";

// ─── API Response Types ─────────────────────────────────────────────

export type APIResponse<D = undefined> = {
    response?: D;
    targets?: string[];
    code: string;
    status: ApiStatus;
};

export type APISuccessResponse<
    D = undefined,
    C extends string = "OK",
    S extends number = 200,
> = {
    response: D;
    code: C;
    status: S;
};

export type APIErrorResponse<C extends string = string> = {
    code: C;
    status: ApiErrorStatus;
    targets?: string[];
};

type SuccessfulParams<T, C extends string = "OK"> = {
    /**
     * Data sent in the JSON body.
     *
     * @default undefined
     */
    response?: T;

    /**
     * Response code for i18n.
     *
     * @default "OK"
     */
    code?: C;
};

// ─── API Response Schemas OpenAPI ───────────────────────────────────

/** Base API error response used across 400/401/403/404/409/422/500 responses. */
export const errorResponseSchema = (status: ApiErrorStatus = 500) =>
    z
        .object({
            code: z.string().describe(`example: ${STATUS_MAP[status]}`),
            status: z.literal(status).describe(`example: ${status}`),
            targets: z
                .array(z.string())
                .optional()
                .describe('example: ["name"]'),
        })
        .describe("ErrorResponse");

/**
 * Factory that builds a typed success response schema.
 *
 * @param dataSchema - Zod schema for the `response` payload.
 * @param modelName - Name of the model.
 */
export const successResponseSchema = <T extends z.ZodTypeAny>(
    dataSchema: T,
    modelName: string,
) =>
    z
        .object({
            response: dataSchema,
            code: z.literal("OK"),
            status: z.literal(200),
        })
        .describe(`${modelName}SuccessResponse`);

export const createdResponseSchema = <T extends z.ZodTypeAny>(
    dataSchema: T,
    modelName: string,
) =>
    z
        .object({
            response: dataSchema,
            code: z.literal("CREATED"),
            status: z.literal(201),
        })
        .describe(`${modelName}CreatedResponse`);

/** Schema for batch operation results deleteMany / updateMany. */
export const batchResultSchema = z
    .object({
        response: z
            .object({
                count: z.number().int().describe("example: 3"),
            })
            .optional(),
        code: z.string().describe("example: OK"),
        status: z.number().int().describe("example: 200"),
    })
    .describe("BatchResult");

export const CommonResponse = {
    /** @returns 400 — missing or invalid ID */
    invalidId({ code = "INVALID_ID" }: { code?: string } = {}): APIResponse {
        return {
            code,
            status: 400,
        };
    },

    /** @returns 400 — malformed request body */
    invalidBody({
        code = "INVALID_BODY",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIResponse {
        return {
            code,
            status: 400,
            targets,
        };
    },

    /** @returns 400 — malformed query params */
    invalidQuery({
        code = "INVALID_QUERY",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIResponse {
        return {
            code,
            status: 400,
            targets,
        };
    },

    /**
     * @returns 200 — successful response with optional payload.
     */
    successful<T = undefined, C extends string = "OK">(
        params?: SuccessfulParams<T, C>,
    ): APISuccessResponse<T, C, 200> {
        return {
            response: params?.response as T,
            code: (params?.code ?? "OK") as C,
            status: 200,
        };
    },

    /** @returns 201 — created resource */
    created<T = undefined, C extends string = "CREATED">(
        params?: SuccessfulParams<T, C>,
    ): APISuccessResponse<T, C, 201> {
        return {
            response: params?.response as T,
            code: (params?.code ?? "CREATED") as C,
            status: 201,
        };
    },

    /** @returns 401 — unauthenticated */
    unauthorized(): APIErrorResponse<"UNAUTHORIZED"> {
        return {
            code: "UNAUTHORIZED",
            status: 401,
        };
    },

    /** @returns 403 — insufficient permissions */
    forbidden({ code = "FORBIDDEN" }: { code?: string } = {}): APIResponse {
        return {
            code,
            status: 403,
        };
    },

    /** @returns 404 — resource not found */
    notFound({
        code = "NOT_FOUND",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIResponse {
        return {
            code,
            status: 404,
            targets,
        };
    },

    /** @returns 409 — conflict */
    conflict({
        code = "CONFLICT",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIResponse {
        return {
            code,
            status: 409,
            targets,
        };
    },

    /** @returns 422 — semantically invalid request */
    unprocessableEntity({
        code = "UNPROCESSABLE_ENTITY",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIResponse {
        return {
            code,
            status: 422,
            targets,
        };
    },

    /** @returns 500 — unexpected server error */
    internalServerError({
        code = "INTERNAL_SERVER_ERROR",
    }: {
        code?: string;
    } = {}): APIResponse {
        return {
            code,
            status: 500,
        };
    },

    /** @returns 400 — custom bad-request response */
    badRequest({
        code = "BAD_REQUEST",
        targets,
    }: {
        code?: string;
        targets?: string[];
    } = {}): APIErrorResponse {
        return {
            code,
            status: 400,
            targets,
        };
    },
} as const;
