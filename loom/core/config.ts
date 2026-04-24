import { z } from "zod";

const EnvBool = z.preprocess((v) => {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["", "0", "false", "no", "off"].includes(s)) return false;
  }
  return v;
}, z.boolean());

const ConfigSchema = z.object({
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  port: z.coerce.number().int().positive().default(3000),
  databaseUrl: z.string().url(),
  databasePoolSize: z.coerce.number().int().positive().default(10),
  sessionSecret: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  publicUrl: z.string().url().default("http://localhost:3000"),
  trustProxy: EnvBool.default(false),
  corsOrigins: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  queueConcurrency: z.coerce.number().int().positive().default(4),
  feedPollConcurrency: z.coerce.number().int().positive().default(4),
  feedPollDefaultInterval: z.coerce.number().int().positive().default(900),
  feedPollTimeout: z.coerce.number().int().positive().default(10000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const raw = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    databaseUrl: process.env.DATABASE_URL,
    databasePoolSize: process.env.DATABASE_POOL_SIZE,
    sessionSecret: process.env.SESSION_SECRET,
    publicUrl: process.env.PUBLIC_URL,
    trustProxy: process.env.TRUST_PROXY,
    corsOrigins: process.env.CORS_ORIGINS,
    logLevel: process.env.LOG_LEVEL,
    queueConcurrency: process.env.QUEUE_CONCURRENCY,
    feedPollConcurrency: process.env.FEED_POLL_CONCURRENCY,
    feedPollDefaultInterval: process.env.FEED_POLL_DEFAULT_INTERVAL,
    feedPollTimeout: process.env.FEED_POLL_TIMEOUT,
  };
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}
