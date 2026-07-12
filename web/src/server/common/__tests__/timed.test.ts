import { describe, it } from "node:test";
import assert from "node:assert";

import { timed } from "../timed";

describe("timed", () => {
    it("returns the wrapped function's result", async (t) => {
        const debug = t.mock.fn();
        const result = await timed({ debug }, "step", async () => 42);
        assert.strictEqual(result, 42);
    });

    it("logs the label and a numeric duration", async (t) => {
        const debug = t.mock.fn();
        await timed({ debug }, "step", async () => "x");
        assert.strictEqual(debug.mock.callCount(), 1);
        const props = debug.mock.calls[0]?.arguments[1] as {
            label: string;
            ms: number;
        };
        assert.strictEqual(props.label, "step");
        assert.strictEqual(typeof props.ms, "number");
    });

    it("still logs when the function throws, and rethrows", async (t) => {
        const debug = t.mock.fn();
        await assert.rejects(
            timed({ debug }, "boom", async () => {
                throw new Error("nope");
            }),
            /nope/,
        );
        assert.strictEqual(debug.mock.callCount(), 1);
    });
});
