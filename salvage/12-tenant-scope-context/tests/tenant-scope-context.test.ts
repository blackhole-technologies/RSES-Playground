/**
 * Tests for the tenant-scope-context primitives.
 *
 * These three cases are extracted from the parent repo's
 * tests/security/tenant-scoped-imports.test.ts — the rest of that file
 * covers the parent repo's lint-style import contract, which doesn't
 * apply outside that codebase. Only the runtime-behavior tests for
 * assertScoped / runInTenantScope are reproduced here.
 */

import { describe, it, expect } from "vitest";
import {
  assertScoped,
  runInTenantScope,
  getCurrentTenantScope,
} from "../src/tenant-scope-context";

describe("tenant-scope-context", () => {
  it("throws outside any scope", () => {
    expect(() => assertScoped("test-job")).toThrow(/test-job/);
  });

  it("returns the bound siteId inside runInTenantScope", () => {
    const result = runInTenantScope("site-42", () => assertScoped("test-job"));
    expect(result).toBe("site-42");
  });

  it("propagates through async boundaries", async () => {
    const result = await runInTenantScope("site-7", async () => {
      // Force a microtask hop to verify AsyncLocalStorage propagation.
      await Promise.resolve();
      await new Promise<void>((r) => setImmediate(r));
      return assertScoped("test-job");
    });
    expect(result).toBe("site-7");
  });

  it("getCurrentTenantScope returns undefined outside any scope", () => {
    expect(getCurrentTenantScope()).toBeUndefined();
  });

  it("getCurrentTenantScope returns the bound siteId inside a scope", () => {
    const result = runInTenantScope("site-xyz", () => getCurrentTenantScope());
    expect(result).toEqual({ siteId: "site-xyz" });
  });

  it("nested scopes replace the outer siteId for the inner callback", () => {
    const result = runInTenantScope("outer", () =>
      runInTenantScope("inner", () => assertScoped("test-job"))
    );
    expect(result).toBe("inner");
  });

  it("scope does not leak across sibling async contexts", async () => {
    const a = runInTenantScope("site-a", async () => {
      await new Promise<void>((r) => setImmediate(r));
      return assertScoped("test-job");
    });
    const b = runInTenantScope("site-b", async () => {
      await new Promise<void>((r) => setImmediate(r));
      return assertScoped("test-job");
    });
    expect(await a).toBe("site-a");
    expect(await b).toBe("site-b");
  });
});
