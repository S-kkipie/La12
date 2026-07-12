/** Minimal subset of a logtape `Logger` that `timed` needs (so a real logger
 *  and a test fake both satisfy it without casts). */
type TimedLogger = {
    debug(message: string, properties?: Record<string, unknown>): void;
};

/**
 * Times an async stage and logs `timing {label} {ms}ms` at debug level. Logs in
 * a `finally` so the duration is recorded even when `fn` throws (then rethrows).
 * Used to find where latency goes across DB/auth/chain stages.
 */
export async function timed<T>(
    logger: TimedLogger,
    label: string,
    fn: () => Promise<T>,
): Promise<T> {
    const start = performance.now();
    try {
        return await fn();
    } finally {
        logger.debug("timing {label} {ms}ms", {
            label,
            ms: Math.round(performance.now() - start),
        });
    }
}
