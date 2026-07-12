import { AsyncLocalStorage } from "node:async_hooks";
import { ansiColorFormatter, configure, getConsoleSink, withFilter } from "@logtape/logtape";

const isDev = process.env.NODE_ENV === "development";

/** Next server instrumentation: configure LogTape so getLogger([...]) emits. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await configure({
    sinks: {
      console: withFilter(getConsoleSink({ formatter: ansiColorFormatter }), isDev ? "debug" : "info"),
    },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
      { category: [], lowestLevel: isDev ? "debug" : "info", sinks: ["console"] },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
    // reset so a repeated register() (dev HMR / double-invoke) doesn't throw
    // LogTape's ConfigError("Already configured").
    reset: true,
  });
}
