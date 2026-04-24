/**
 * Minimal logger stub. The parent repo uses pino; this library is
 * logger-agnostic. Replace the implementation here with your own
 * logger of choice, or leave the console fallback for development.
 *
 * The interface matches the subset of pino used by the salvaged files:
 * info/warn/error/debug, each accepting either (msg) or (obj, msg).
 */

export interface ModuleLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

export function createModuleLogger(moduleName: string): ModuleLogger {
  const prefix = `[${moduleName}]`;
  const log = (level: "info" | "warn" | "error" | "debug") =>
    (obj: unknown, msg?: string) => {
      if (typeof obj === "string") {
        console[level === "debug" ? "log" : level](prefix, obj);
      } else {
        console[level === "debug" ? "log" : level](prefix, msg ?? "", obj);
      }
    };

  return {
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    debug: log("debug"),
  };
}
