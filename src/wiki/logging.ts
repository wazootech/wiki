/**
 * A stand-in for Python's `logging` module.
 *
 * The Python engine never calls `logging.basicConfig`, so a `logger.warning`
 * reaches stderr through `logging.lastResort` — formatted as the bare message,
 * with no level prefix and no logger name. Warnings are user-facing here (an
 * unparseable `.ttl`, a source cache with no lockfile provenance), so the port
 * must not swallow them, and unlike the `debug` lines in `parser.ts` they are
 * not gated behind `WIKI_DEBUG`.
 *
 * `error` is the one level that is *not* faithfully reproduced: owlrl failures
 * go through `logger.error` in `infer.py`, and Python prints those to stderr
 * too. Same treatment, same reasoning.
 *
 * The emission goes through one swappable sink so a test can assert on a
 * warning without capturing the process's stderr, which is shared with test
 * harnesses running in parallel.
 */

export type LogLevel = "debug" | "warning" | "error";

export interface LogRecord {
  /** The logger name, as `__name__` would spell it (`wiki.graph`). */
  readonly logger: string;
  readonly level: LogLevel;
  readonly message: string;
}

export type LogSink = (record: LogRecord) => void;

let sink: LogSink | null = null;

/** Route log output elsewhere. Pass `null` to restore the default sink. */
export function setLogSink(next: LogSink | null): void {
  sink = next;
}

function emit(record: LogRecord): void {
  if (sink !== null) {
    sink(record);
    return;
  }
  // `logging.lastResort` writes the bare message to stderr at WARNING and above.
  if (record.level === "debug") {
    if (Deno.env.get("WIKI_DEBUG")) {
      console.error(`[${record.logger}] ${record.message}`);
    }
    return;
  }
  console.error(record.message);
}

export interface Logger {
  debug(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** The logger for a module, named the way `logging.getLogger(__name__)` is. */
export function getLogger(name: string): Logger {
  return {
    debug: (message) => emit({ logger: name, level: "debug", message }),
    warning: (message) => emit({ logger: name, level: "warning", message }),
    error: (message) => emit({ logger: name, level: "error", message }),
  };
}
