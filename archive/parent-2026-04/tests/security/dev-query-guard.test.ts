/**
 * @file dev-query-guard.test.ts
 * @description Unit tests for the development-time Proxy guard that blocks
 *              direct `db.select/insert/update/delete` on multi-tenant tables.
 * @milestone M1.3 (ROADMAP_2026-04-14_v6.md — Drizzle pre-query hook)
 *
 * # What this test guarantees
 *
 * The runtime complement to `tenant-scoped-imports.test.ts`. That test
 * catches missing *imports*; this test catches missing *calls* — a file
 * that imports the helper but still reaches for raw `db.select()` on a
 * tagged table silently leaks data, and only a runtime gate can see it.
 *
 * # Why the tests use a fake db
 *
 * The guard is a pure function of `(rawDb, options) → wrappedDb`. It
 * does not need a real Drizzle client — every assertion is about what
 * happens at the Proxy's `get` trap when a verb is called with a tagged
 * vs. untagged table. Using a fake `rawDb` keeps the tests:
 *
 *   - Fast (no DB connection required).
 *   - Independent of `server/db.ts` (which throws at import if
 *     `DATABASE_URL` is not set).
 *   - Runnable under the `test:security` fast suite, which is a CI
 *     gate that must stay DB-free.
 *
 * Fake tables are just `{}` — WeakMap keys are compared by identity,
 * so any unique object reference works. Registering a fake via
 * `registerMultiTenantTable` is enough to make `isMultiTenantTable`
 * return true for it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  wrapDbWithDevGuard,
  type DevQueryGuardOptions,
} from "../../server/lib/dev-query-guard";
import {
  registerMultiTenantTable,
  isMultiTenantTable,
} from "../../server/lib/tenant-scoped-tables";

// =====================================================================
// Fakes
// =====================================================================

/**
 * Build a fake Drizzle-like db with spies on each verb. Each call
 * records the arguments it was invoked with so the tests can assert
 * "passed through to the underlying client with these exact arguments"
 * (the pass-through cases) or "never called at all" (the blocked
 * cases — the guard should throw before the fake receives the call).
 *
 * `select()` returns a one-level builder shaped like Drizzle's:
 *   rawDb.select().from(table)
 * The builder's `.from()` is also a spy so tests can observe it.
 */
function makeFakeDb() {
  const calls: Record<string, unknown[][]> = {
    select: [],
    from: [],
    insert: [],
    update: [],
    delete: [],
  };

  const builder = {
    from: (...args: unknown[]) => {
      calls.from.push(args);
      // Return a terminal "result" sentinel so assertions can
      // confirm the pass-through reached this far. In real Drizzle
      // this would be another chainable builder, but the guard
      // never touches anything past `.from()`.
      return { __tag: "from-result", args };
    },
  };

  const fakeDb = {
    select: (...args: unknown[]) => {
      calls.select.push(args);
      return builder;
    },
    insert: (...args: unknown[]) => {
      calls.insert.push(args);
      return { __tag: "insert-result", args };
    },
    update: (...args: unknown[]) => {
      calls.update.push(args);
      return { __tag: "update-result", args };
    },
    delete: (...args: unknown[]) => {
      calls.delete.push(args);
      return { __tag: "delete-result", args };
    },

    // A passthrough property (non-function) that the guard should
    // ignore entirely. Present to prove the Proxy does not widen or
    // mutate arbitrary properties on the underlying db.
    schemaName: "public",

    // A passthrough method (not one of the four verbs) that should
    // forward unchanged. Used to confirm the guard does not
    // accidentally block unrelated methods like transaction/execute.
    transaction: (fn: (tx: unknown) => unknown) => fn({ __tag: "tx" }),
  };

  return { fakeDb, calls };
}

// A tagged fake table (registered in the multi-tenant registry) and an
// untagged fake (not registered). Each test gets a fresh pair so
// cross-test contamination via the module-singleton WeakMap is
// impossible — the WeakMap is keyed by identity, and every new object
// creates a new identity.
function makeFakeTables() {
  const tagged = {
    // Drizzle exposes the table's SQL name under `_.name`. The guard
    // reads this to build its error message. Including it makes the
    // blocked-message assertion meaningful.
    _: { name: "tagged_fake" },
  };
  const untagged = {
    _: { name: "untagged_fake" },
  };

  // Register the tagged one via the real registry API. The PgColumn
  // argument is unused by isMultiTenantTable (which only checks map
  // membership) so a sentinel object is fine.
  const fakeColumn = { __tag: "fake-column" };
  // Cast through `unknown` rather than `any` so eslint-no-explicit-any
  // stays happy and the cast is narrow to the boundary of the fake.
  registerMultiTenantTable(
    tagged as unknown as Parameters<typeof registerMultiTenantTable>[0],
    fakeColumn as unknown as Parameters<typeof registerMultiTenantTable>[1]
  );

  return { tagged, untagged };
}

const ENABLED: DevQueryGuardOptions = { enabled: true };
const DISABLED: DevQueryGuardOptions = { enabled: false };

// =====================================================================
// Tests
// =====================================================================

describe("wrapDbWithDevGuard — disabled path", () => {
  it("returns the raw db unchanged when enabled is false", () => {
    const { fakeDb } = makeFakeDb();
    const wrapped = wrapDbWithDevGuard(fakeDb, DISABLED);

    // Identity check — a disabled guard must not wrap at all, because
    // wrapping always adds Proxy overhead and subtly alters behavior
    // (e.g. `===` comparisons). The contract is "zero cost when off."
    expect(wrapped).toBe(fakeDb);
  });

  it("lets direct calls on tagged tables through when disabled", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, DISABLED);

    // Both the top-level verbs and the select().from() chain must
    // forward without interception when the guard is off — that is
    // the production-and-test path and any interference would cause
    // false positives in CI.
    expect(() => wrapped.select().from(tagged)).not.toThrow();
    expect(() => wrapped.insert(tagged)).not.toThrow();
    expect(() => wrapped.update(tagged)).not.toThrow();
    expect(() => wrapped.delete(tagged)).not.toThrow();

    expect(calls.from).toHaveLength(1);
    expect(calls.insert).toHaveLength(1);
    expect(calls.update).toHaveLength(1);
    expect(calls.delete).toHaveLength(1);
  });
});

describe("wrapDbWithDevGuard — enabled path, tagged table", () => {
  it("blocks db.select().from(taggedTable)", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    // `select()` itself must still be callable — it is only `.from()`
    // that sees the table argument, so the throw must happen on
    // `.from(tagged)` not on the bare `select()`. This mirrors the
    // Drizzle API so the error surfaces at the call site that
    // actually references the tagged table.
    const builder = wrapped.select();
    expect(() => builder.from(tagged)).toThrow(
      /dev-query-guard: blocked direct db\.select\(\) on multi-tenant table "tagged_fake"/
    );

    // The fake's `from` should not have been reached — the guard
    // threw before delegating. This proves the block is "fail
    // before execution" not "throw after the fact".
    expect(calls.from).toHaveLength(0);
  });

  it("blocks db.insert(taggedTable)", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    expect(() => wrapped.insert(tagged)).toThrow(
      /dev-query-guard: blocked direct db\.insert\(\) on multi-tenant table "tagged_fake"/
    );
    expect(calls.insert).toHaveLength(0);
  });

  it("blocks db.update(taggedTable)", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    expect(() => wrapped.update(tagged)).toThrow(
      /dev-query-guard: blocked direct db\.update\(\) on multi-tenant table "tagged_fake"/
    );
    expect(calls.update).toHaveLength(0);
  });

  it("blocks db.delete(taggedTable)", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    expect(() => wrapped.delete(tagged)).toThrow(
      /dev-query-guard: blocked direct db\.delete\(\) on multi-tenant table "tagged_fake"/
    );
    expect(calls.delete).toHaveLength(0);
  });

  it("error message names the fix (scoped / withDbSiteScope)", () => {
    // The fix recipe in the error message is load-bearing: a
    // developer who hits this error needs to know exactly which
    // helpers to reach for without having to grep the codebase.
    // Assert the substring so the message cannot drift silently.
    const { fakeDb } = makeFakeDb();
    const { tagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    try {
      wrapped.insert(tagged);
      throw new Error("expected wrapped.insert to throw but it did not");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("scoped(siteId)");
      expect(msg).toContain("withDbSiteScope");
      expect(msg).toContain("tenant-scoped.ts");
    }
  });
});

describe("wrapDbWithDevGuard — enabled path, untagged table", () => {
  it("passes db.select().from(untaggedTable) through unchanged", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { untagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    const result = wrapped.select().from(untagged) as { __tag: string };
    expect(result.__tag).toBe("from-result");
    expect(calls.select).toHaveLength(1);
    expect(calls.from).toHaveLength(1);
    expect(calls.from[0][0]).toBe(untagged);
  });

  it("passes db.insert(untaggedTable) through unchanged", () => {
    const { fakeDb, calls } = makeFakeDb();
    const { untagged } = makeFakeTables();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    const result = wrapped.insert(untagged) as { __tag: string };
    expect(result.__tag).toBe("insert-result");
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0][0]).toBe(untagged);
  });

  it("passes non-verb properties through unchanged", () => {
    // Properties that are not select/insert/update/delete must be
    // forwarded via Reflect.get with zero interception. Tests the
    // "we did not accidentally widen the Proxy's reach" contract.
    const { fakeDb } = makeFakeDb();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    expect(wrapped.schemaName).toBe("public");

    const txResult = wrapped.transaction((tx) => ({
      tag: (tx as { __tag: string }).__tag,
    }));
    expect(txResult).toEqual({ tag: "tx" });
  });

  it("does not affect isMultiTenantTable itself", () => {
    // Sanity check: the registry state observed via isMultiTenantTable
    // should be unaffected by whether a guard has been instantiated
    // over it. The guard reads the registry; it does not mutate it.
    const { tagged, untagged } = makeFakeTables();
    expect(
      isMultiTenantTable(
        tagged as unknown as Parameters<typeof isMultiTenantTable>[0]
      )
    ).toBe(true);
    expect(
      isMultiTenantTable(
        untagged as unknown as Parameters<typeof isMultiTenantTable>[0]
      )
    ).toBe(false);
  });
});

describe("wrapDbWithDevGuard — Proxy integrity", () => {
  // A few small sanity checks on Proxy behavior that would be easy to
  // break with a careless refactor of the wrapper. These do not test
  // the main security contract, but they document invariants the
  // rest of the codebase can rely on.

  it("select() returns a builder whose non-from methods still work", () => {
    // If we add more builder-method interception later, we must not
    // accidentally break methods other than `.from()`. This test
    // locks in the current behavior: everything other than `.from`
    // forwards unchanged.
    const { fakeDb } = makeFakeDb();
    const wrapped = wrapDbWithDevGuard(fakeDb, ENABLED);

    const builder = wrapped.select() as {
      from: (t: unknown) => unknown;
      // The fake builder only has `from`, but any additional property
      // read should return undefined via Reflect.get, not throw.
      nonexistent?: unknown;
    };
    expect(builder.nonexistent).toBeUndefined();
  });

  it("wrapping is idempotent under double-wrap (no infinite recursion)", () => {
    // Wrapping an already-wrapped db should not cause stack overflow
    // or double interception. Each layer's Proxy traps delegate to
    // the inner Proxy via Reflect, which in turn delegates to the
    // raw db. The observable behavior is identical.
    const { fakeDb } = makeFakeDb();
    const { tagged, untagged } = makeFakeTables();

    const once = wrapDbWithDevGuard(fakeDb, ENABLED);
    const twice = wrapDbWithDevGuard(once, ENABLED);

    expect(() => twice.insert(tagged)).toThrow(/dev-query-guard/);
    expect(() => twice.insert(untagged)).not.toThrow();
  });
});
