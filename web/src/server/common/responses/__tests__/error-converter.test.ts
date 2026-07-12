import { describe, it, before } from "node:test";
import assert from "node:assert";

import { configure } from "@logtape/logtape";

import { AppErrors } from "../app-error";
import { errorToResponse } from "../error-converter";

// errorToResponse logs via getLogger(["server", "error"]) for 5xx errors.
// LogTape isn't configured in this bare `tsx --test` process, which would
// otherwise print a "not configured" meta-warning to the console on the
// first log call. Configure a silent, sink-less root logger up front so the
// 5xx test case below stays quiet and test output remains pristine.
before(async () => {
    await configure({
        sinks: {},
        loggers: [{ category: [], sinks: [], lowestLevel: "info" }],
        reset: true,
    });
});

describe("errorToResponse", () => {
    it("maps a 4xx AppError to the wire envelope, forwarding targets and omitting detail", () => {
        const error = AppErrors.invalidBody({ targets: ["name", "email"] });

        const response = errorToResponse(error);

        assert.strictEqual(response.code, "INVALID_BODY");
        assert.strictEqual(response.status, 400);
        assert.deepStrictEqual(response.targets, ["name", "email"]);
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(response, "detail"),
            false,
        );
    });

    it("maps a 5xx AppError without leaking cause onto the wire", () => {
        const error = AppErrors.unexpected(new Error("boom"));

        const response = errorToResponse(error);

        assert.strictEqual(response.code, "INTERNAL_SERVER_ERROR");
        assert.strictEqual(response.status, 500);
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(response, "cause"),
            false,
        );
    });

    it("leaves targets undefined for an error with no targets", () => {
        const error = AppErrors.unauthorized();

        const response = errorToResponse(error);

        assert.strictEqual(response.code, "UNAUTHORIZED");
        assert.strictEqual(response.status, 401);
        assert.strictEqual(response.targets, undefined);
    });
});
