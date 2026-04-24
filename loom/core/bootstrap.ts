import express, { type Express } from "express";
import { loadConfig, type Config } from "./config";
import { createDbHandle, type DbHandle } from "./db";
import { createEventBus, type EventBus } from "./events";
import { createHookRegistry, type HookRegistry } from "./hooks";
import {
  createModuleLogger,
  correlationMiddleware,
  requestLoggingMiddleware,
} from "../engines/logger";
import { metricsMiddleware, registerMetricsRoute } from "../engines/metrics";
import { createSecurityMiddleware } from "../engines/security";

export interface App {
  express: Express;
  config: Config;
  db: DbHandle;
  events: EventBus;
  hooks: HookRegistry;
}

export interface BootstrapResult {
  app: App;
  stop: () => Promise<void>;
}

export async function bootstrap(): Promise<BootstrapResult> {
  const config = loadConfig();
  const log = createModuleLogger("bootstrap");
  log.info(
    { nodeEnv: config.nodeEnv, port: config.port },
    "Starting loom",
  );

  const db = createDbHandle(config);
  const events = createEventBus();
  const hooks = createHookRegistry();

  const expressApp = express();
  if (config.trustProxy) expressApp.set("trust proxy", true);

  expressApp.use(correlationMiddleware());
  expressApp.use(requestLoggingMiddleware());
  expressApp.use(express.json({ limit: "1mb" }));
  expressApp.use(express.urlencoded({ extended: false, limit: "1mb" }));

  const securityMw = createSecurityMiddleware({
    maxBodySize: 1024 * 1024,
    enableCsrf: config.nodeEnv === "production",
    rateLimitExemptPaths: ["/health", "/ready", "/metrics"],
  });
  for (const mw of securityMw) expressApp.use(mw);

  expressApp.use(metricsMiddleware());
  registerMetricsRoute(expressApp);

  expressApp.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "loom" });
  });

  const server = expressApp.listen(config.port, () => {
    log.info(
      { port: config.port, url: `http://localhost:${config.port}` },
      "loom is listening",
    );
  });

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    log.info("Shutting down");
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await db.pool.end().catch(() => {});
    log.info("Shutdown complete");
  };

  const onSignal = (sig: string): void => {
    log.info({ signal: sig }, "Signal received");
    stop().catch((err) => log.error({ err }, "Shutdown error"));
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  return {
    app: { express: expressApp, config, db, events, hooks },
    stop,
  };
}
