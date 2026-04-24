import { describe, it, expect } from "vitest";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { createUserScopedTableRegistry } from "./registry";

/**
 * Minimal fake Drizzle table. The registry only checks reference identity
 * via WeakMap, so the exact shape doesn't matter for these tests — we just
 * need distinct object identities.
 */
function fakeTable(name: string): PgTable {
  return { _: { name } } as unknown as PgTable;
}

function fakeColumn(name: string): PgColumn {
  return { name } as unknown as PgColumn;
}

describe("user-scoped table registry", () => {
  it("isRegistered returns false for unregistered tables", () => {
    const registry = createUserScopedTableRegistry();
    expect(registry.isRegistered(fakeTable("posts"))).toBe(false);
  });

  it("register marks a table as scoped", () => {
    const registry = createUserScopedTableRegistry();
    const posts = fakeTable("posts");
    registry.register(posts, fakeColumn("user_id"));
    expect(registry.isRegistered(posts)).toBe(true);
  });

  it("userIdColumnFor returns the registered column", () => {
    const registry = createUserScopedTableRegistry();
    const posts = fakeTable("posts");
    const userIdCol = fakeColumn("user_id");
    registry.register(posts, userIdCol);
    expect(registry.userIdColumnFor(posts)).toBe(userIdCol);
  });

  it("userIdColumnFor throws on unregistered tables", () => {
    const registry = createUserScopedTableRegistry();
    expect(() => registry.userIdColumnFor(fakeTable("unknown"))).toThrow(
      /not registered as user-scoped/,
    );
  });

  it("register is idempotent — second call replaces the column", () => {
    const registry = createUserScopedTableRegistry();
    const posts = fakeTable("posts");
    const col1 = fakeColumn("user_id_v1");
    const col2 = fakeColumn("user_id_v2");
    registry.register(posts, col1);
    registry.register(posts, col2);
    expect(registry.userIdColumnFor(posts)).toBe(col2);
  });

  it("registries created from the factory are independent", () => {
    const a = createUserScopedTableRegistry();
    const b = createUserScopedTableRegistry();
    const posts = fakeTable("posts");
    a.register(posts, fakeColumn("user_id"));
    expect(a.isRegistered(posts)).toBe(true);
    expect(b.isRegistered(posts)).toBe(false);
  });
});
