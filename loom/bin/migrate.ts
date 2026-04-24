#!/usr/bin/env tsx
/**
 * CLI: apply pending migrations.
 * Usage: pnpm db:migrate
 *
 * Scans core/migrations/ and modules/* /migrations/, applies any
 * not already in _migrations, prints what was applied.
 */

import { loadConfig } from "../core/config";
import { createMigrationRunner } from "../core/migrations/runner";

async function main() {
  const config = loadConfig();
  const runner = createMigrationRunner({
    databaseUrl: config.databaseUrl,
    directories: ["core/migrations", "modules/*/migrations"],
  });

  try {
    const pending = await runner.pending();
    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`Applying ${pending.length} migration(s):`);
    for (const m of pending) console.log(`  ${m.name}`);

    const applied = await runner.up();
    console.log(`\nApplied ${applied.length} migration(s) successfully.`);
  } finally {
    await runner.close();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
