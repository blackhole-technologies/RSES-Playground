import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { CircuitBreaker } from "../vendor/06-circuit-breaker/src/circuit-breaker";
import type { Config } from "./config";

export type Db = NodePgDatabase;

export interface DbHandle {
  pool: pg.Pool;
  db: Db;
  breaker: CircuitBreaker;
  query<T>(op: () => Promise<T>): Promise<T>;
}

export function createDbHandle(config: Config): DbHandle {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolSize,
  });
  const db = drizzle(pool);
  const breaker = new CircuitBreaker({
    name: "database",
    failureThreshold: 5,
    resetTimeout: 30_000,
    successThreshold: 2,
  });
  const query = <T>(op: () => Promise<T>): Promise<T> => breaker.execute(op);
  return { pool, db, breaker, query };
}

export async function closeDb(handle: DbHandle): Promise<void> {
  await handle.pool.end();
}
