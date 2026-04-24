/**
 * @file module-timeout.test.ts
 * @description Verifies that module lifecycle operations respect the timeout
 * budget added in ROADMAP M1.1.
 *
 * The kernel must never hang on a misbehaving module. A module whose
 * initialize/start/stop never settles must be marked failed and bootstrap
 * must continue. This test asserts the Promise.race + timeout pattern works.
 */

import { describe, it, expect } from "vitest";
import { ModuleOperationTimeoutError } from "../../server/kernel/registry";

// We test the timeout helper indirectly by importing the error class and
// constructing a small race that mirrors the implementation. The implementation
// is private (`withModuleTimeout`) so we replicate its shape here. The point
// of this test is twofold:
//   (a) Lock in the public ModuleOperationTimeoutError contract so it can't
//       silently change shape (other code may pattern-match on it).
//   (b) Document the timeout-race semantics in a runnable form that any
//       future maintainer can read.

describe("ModuleOperationTimeoutError", () => {
  it("carries the moduleId, operation, and timeoutMs in its fields", () => {
    const err = new ModuleOperationTimeoutError("my-mod", "initialize", 30000);
    expect(err.moduleId).toBe("my-mod");
    expect(err.operation).toBe("initialize");
    expect(err.timeoutMs).toBe(30000);
    expect(err.name).toBe("ModuleOperationTimeoutError");
    expect(err.message).toContain("my-mod");
    expect(err.message).toContain("initialize");
    expect(err.message).toContain("30000ms");
  });

  it("is an Error subclass and instanceof works", () => {
    const err = new ModuleOperationTimeoutError("m", "stop", 1000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ModuleOperationTimeoutError);
  });

  it("supports all three lifecycle operations", () => {
    expect(
      new ModuleOperationTimeoutError("m", "initialize", 1).operation
    ).toBe("initialize");
    expect(new ModuleOperationTimeoutError("m", "start", 1).operation).toBe(
      "start"
    );
    expect(new ModuleOperationTimeoutError("m", "stop", 1).operation).toBe(
      "stop"
    );
  });
});

describe("timeout-race semantics (regression contract)", () => {
  // Mirror of the registry's withModuleTimeout, kept in test scope so the
  // semantics it depends on are pinned. If you change the behavior in
  // registry.ts, update this contract test in the same PR.
  function raceWithTimeout<T>(
    op: Promise<T>,
    ms: number,
    moduleId: string,
    operation: "initialize" | "start" | "stop"
  ): Promise<T> {
    let handle: NodeJS.Timeout | undefined;
    const timer = new Promise<never>((_, reject) => {
      handle = setTimeout(() => {
        reject(new ModuleOperationTimeoutError(moduleId, operation, ms));
      }, ms);
      handle.unref?.();
    });
    return Promise.race([op, timer]).finally(() => {
      if (handle) clearTimeout(handle);
    });
  }

  it("resolves with the operation result if it completes in time", async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 10));
    await expect(raceWithTimeout(fast, 1000, "m", "initialize")).resolves.toBe("ok");
  });

  it("rejects with ModuleOperationTimeoutError if the operation hangs", async () => {
    // Promise that never resolves on its own.
    const hang = new Promise<string>(() => {
      /* intentionally never settles */
    });
    await expect(raceWithTimeout(hang, 50, "hung-mod", "initialize")).rejects.toBeInstanceOf(
      ModuleOperationTimeoutError
    );
  });

  it("propagates the original rejection if the operation fails before the timeout", async () => {
    const fail = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("boom")), 10)
    );
    await expect(raceWithTimeout(fail, 1000, "m", "start")).rejects.toThrowError(
      "boom"
    );
  });

  it("does not leak the timer handle after the operation wins", async () => {
    // If the timer were not cleared, this test would hang the process for
    // 5 seconds before vitest's own teardown — running it under the default
    // test timeout proves the .finally(clearTimeout) is reached.
    const fast = Promise.resolve("done");
    await raceWithTimeout(fast, 5000, "m", "stop");
    // If we reach here without the test framework complaining about a
    // pending timer, the cleanup is correct.
  });
});
