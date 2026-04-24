import { describe, it, expect } from "vitest";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { createUserScopedTableRegistry } from "./registry";
import { wrapDbWithDevGuard } from "./dev-guard";

function fakeTable(name: string): PgTable {
  return { _: { name } } as unknown as PgTable;
}
function fakeColumn(name: string): PgColumn {
  return { name } as unknown as PgColumn;
}

/**
 * Minimal fake Drizzle-shaped db. The guard only looks at the four verb
 * methods; anything else passes through via Reflect.get unchanged.
 */
function fakeDb() {
  const calls: string[] = [];
  const db = {
    select() {
      return {
        from(t: PgTable) {
          calls.push(`select:${(t as { _: { name: string } })._.name}`);
          return { where: () => Promise.resolve([]) };
        },
      };
    },
    insert(t: PgTable) {
      calls.push(`insert:${(t as { _: { name: string } })._.name}`);
      return { values: () => Promise.resolve() };
    },
    update(t: PgTable) {
      calls.push(`update:${(t as { _: { name: string } })._.name}`);
      return { set: () => ({ where: () => Promise.resolve() }) };
    },
    delete(t: PgTable) {
      calls.push(`delete:${(t as { _: { name: string } })._.name}`);
      return { where: () => Promise.resolve() };
    },
    transaction: () => Promise.resolve(),
    execute: () => Promise.resolve(),
    custom: "passthrough",
  };
  return { db, calls };
}

describe("dev-guard", () => {
  describe("disabled", () => {
    it("returns the raw db by identity", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: false });
      expect(wrapped).toBe(db);
    });

    it("does not intercept queries on registered tables", () => {
      const { db, calls } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: false });
      wrapped.select().from(posts);
      expect(calls).toEqual(["select:posts"]);
    });
  });

  describe("enabled + registered table", () => {
    it("blocks db.select().from(registered)", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(() => wrapped.select().from(posts)).toThrow(/blocked direct db.select/);
    });

    it("blocks db.insert(registered)", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(() => wrapped.insert(posts)).toThrow(/blocked direct db.insert/);
    });

    it("blocks db.update(registered)", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(() => wrapped.update(posts)).toThrow(/blocked direct db.update/);
    });

    it("blocks db.delete(registered)", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(() => wrapped.delete(posts)).toThrow(/blocked direct db.delete/);
    });

    it("error message includes the table name and fix recipe", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const posts = fakeTable("user_posts");
      registry.register(posts, fakeColumn("user_id"));
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(() => wrapped.insert(posts)).toThrow(/user_posts/);
      expect(() => wrapped.insert(posts)).toThrow(/tenantScope.scoped/);
    });
  });

  describe("enabled + unregistered table", () => {
    it("lets db.select().from(unregistered) through", () => {
      const { db, calls } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const feeds = fakeTable("feeds");
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      wrapped.select().from(feeds);
      expect(calls).toEqual(["select:feeds"]);
    });

    it("lets db.insert(unregistered) through", () => {
      const { db, calls } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const feeds = fakeTable("feeds");
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      wrapped.insert(feeds);
      expect(calls).toEqual(["insert:feeds"]);
    });
  });

  describe("integrity", () => {
    it("passes non-verb properties through unchanged", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect((wrapped as typeof db).custom).toBe("passthrough");
    });

    it("passes non-verb methods through unchanged", () => {
      const { db } = fakeDb();
      const registry = createUserScopedTableRegistry();
      const wrapped = wrapDbWithDevGuard(db, registry, { enabled: true });
      expect(typeof (wrapped as typeof db).transaction).toBe("function");
      expect(typeof (wrapped as typeof db).execute).toBe("function");
    });
  });
});
