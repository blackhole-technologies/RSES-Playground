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
import {
  createTenantScope,
  type TenantScope,
} from "../engines/tenant-scope";
import { sessions } from "../modules/auth/schema";
import { createBootstrapToken } from "../modules/auth/service";
import { createAuthMiddleware } from "../modules/auth/middleware";
import { createAuthRouter } from "../modules/auth/routes";
import { createSetupRouter } from "../modules/auth/setup-routes";
import { createLoginRateLimiter } from "../modules/auth/rate-limit";

export interface App {
  express: Express;
  config: Config;
  db: DbHandle;
  events: EventBus;
  hooks: HookRegistry;
  tenantScope: TenantScope;
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

  // Ping the database at boot. A misconfigured DATABASE_URL should fail
  // loudly here rather than on the first request. The circuit breaker
  // wraps production queries, but the sanity check runs raw so the error
  // bubbles up untransformed.
  try {
    await db.pool.query("SELECT 1");
    log.info("Database reachable");
  } catch (err) {
    log.fatal({ err }, "Database unreachable at boot — check DATABASE_URL");
    throw err;
  }

  // Tenant scope: per-user query isolation. Register every user-scoped
  // table here. The dev-guard (only active when NODE_ENV=development)
  // intercepts raw `db.db.<verb>(table)` calls on registered tables and
  // throws — pushing developers toward `tenantScope.scoped()`. In
  // production the guard is a no-op; Postgres RLS (future) is the
  // real isolation layer.
  const tenantScope = createTenantScope(db);
  tenantScope.register(sessions, sessions.userId);
  db.db = tenantScope.wrapDb(db.db);

  // Bootstrap-token generation: first-boot flow per SPEC §5.1.
  // createBootstrapToken returns a raw token only when system_settings
  // has no hash AND no users exist — i.e., truly first boot. On
  // subsequent boots, the existing hash short-circuits and we don't
  // re-log. The single log line below is the ONLY place the raw token
  // appears; admins must capture it from this boot or run
  // `pnpm db:reset` to start over.
  const bootstrapToken = await createBootstrapToken(db);
  if (bootstrapToken) {
    log.warn(
      `FIRST BOOT: visit ${config.publicUrl}/setup?token=${bootstrapToken}`,
    );
  }

  const events = createEventBus();
  const hooks = createHookRegistry();
  const rateLimiter = createLoginRateLimiter();

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

  // Cookie name follows SPEC's `__Host-` prefix in production; the
  // prefix requires Secure + Path=/, both of which routes/setup-routes
  // set automatically when cookieSecure is true.
  const cookieName =
    config.nodeEnv === "production" ? "__Host-session" : "session";
  const cookieSecure = config.nodeEnv === "production";

  // Auth middleware runs on every request (permissive — req.user is
  // optional). Routes that require auth opt in via `requireAuth`.
  expressApp.use(createAuthMiddleware(db, { cookieName }));
  expressApp.use(
    "/api/auth",
    createAuthRouter(db, rateLimiter, { cookieName, cookieSecure }),
  );
  expressApp.use(
    "/setup",
    createSetupRouter(db, { cookieName, cookieSecure }),
  );

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
    app: { express: expressApp, config, db, events, hooks, tenantScope },
    stop,
  };
}
