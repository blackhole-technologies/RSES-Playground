#!/usr/bin/env tsx
/**
 * CLI: drop all tables in the public schema and re-run migrations.
 *
 * Destructive — refuses to run when NODE_ENV=production.
 *
 * Usage: pnpm db:reset
 */

import pg from "pg";
import { loadConfig } from "../core/config";
import { createMigrationRunner } from "../core/migrations/runner";

async function main() {
  const config = loadConfig();

  if (config.nodeEnv === "production") {
    console.error("db:reset refuses to run with NODE_ENV=production.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
  try {
    console.log("Dropping public schema...");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await pool.query("GRANT ALL ON SCHEMA public TO public");
  } finally {
    await pool.end();
  }

  const runner = createMigrationRunner({
    databaseUrl: config.databaseUrl,
    directories: ["core/migrations", "modules/*/migrations"],
  });
  try {
    const applied = await runner.up();
    console.log(`Applied ${applied.length} migration(s) on a fresh schema.`);
  } finally {
    await runner.close();
  }
}

main().catch((err) => {
  console.error("db:reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
