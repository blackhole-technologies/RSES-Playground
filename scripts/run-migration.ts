/**
 * Run custom migration for feature flags tables
 */
import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const migrationPath = path.join(
      process.cwd(),
      "migrations",
      "0001_add_feature_flags_tables.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    console.log("Running migration: 0001_add_feature_flags_tables.sql");
    await pool.query(sql);
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
