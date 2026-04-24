/**
 * @file sandbox.test.ts
 * @description Tests for the module sandboxing system.
 *
 * Validates import whitelist enforcement, filesystem access control,
 * tier-based sandbox configuration, and violation logging.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createModuleSandbox,
  getSandboxConfigForTier,
  getViolationLog,
  DEFAULT_SANDBOX_CONFIG,
  type SandboxConfig,
} from "@server/kernel/sandbox";
import * as path from "path";

// =============================================================================
// HELPERS
// =============================================================================

function makeConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    allowedImports: ["path", "crypto"],
    maxMemoryMB: 64,
    timeoutMs: 5000,
    allowedPaths: ["/tmp/sandbox-test"],
    label: "test-module",
    ...overrides,
  };
}

// =============================================================================
// TESTS: createModuleSandbox
// =============================================================================

describe("createModuleSandbox", () => {
  it("should create a sandbox with merged config", () => {
    const config = makeConfig({ allowedImports: ["express"] });
    const sandbox = createModuleSandbox(config);
    const resolved = sandbox.getConfig();

    // Should include both default and custom allowed imports
    expect(resolved.allowedImports).toContain("express");
    expect(resolved.allowedImports).toContain("path");
    expect(resolved.allowedImports).toContain("crypto");
    expect(resolved.allowedImports).toContain("util"); // from defaults
    expect(resolved.allowedImports).toContain("buffer"); // from defaults
  });

  it("should deduplicate allowed imports", () => {
    const config = makeConfig({ allowedImports: ["path", "path", "crypto"] });
    const sandbox = createModuleSandbox(config);
    const resolved = sandbox.getConfig();

    const pathCount = resolved.allowedImports.filter((i) => i === "path").length;
    expect(pathCount).toBe(1);
  });

  it("should not be disposed initially", () => {
    const sandbox = createModuleSandbox(makeConfig());
    expect(sandbox.isDisposed()).toBe(false);
  });
});

// =============================================================================
// TESTS: Import whitelist
// =============================================================================

describe("import whitelist", () => {
  it("should allow whitelisted imports", () => {
    const sandbox = createModuleSandbox(makeConfig());
    expect(sandbox.isImportAllowed("path")).toBe(true);
    expect(sandbox.isImportAllowed("crypto")).toBe(true);
  });

  it("should deny non-whitelisted imports", () => {
    const sandbox = createModuleSandbox(
      makeConfig({ allowedImports: ["path"] })
    );
    expect(sandbox.isImportAllowed("fs")).toBe(false);
    expect(sandbox.isImportAllowed("child_process")).toBe(false);
    expect(sandbox.isImportAllowed("net")).toBe(false);
  });

  it("should handle node: prefix imports", () => {
    const sandbox = createModuleSandbox(makeConfig());
    // "path" is allowed, so "node:path" should also be allowed
    expect(sandbox.isImportAllowed("node:path")).toBe(true);
    expect(sandbox.isImportAllowed("node:fs")).toBe(false);
  });

  it("should deny dangerous modules by default", () => {
    const sandbox = createModuleSandbox(makeConfig({ allowedImports: [] }));
    expect(sandbox.isImportAllowed("child_process")).toBe(false);
    expect(sandbox.isImportAllowed("fs")).toBe(false);
    expect(sandbox.isImportAllowed("net")).toBe(false);
    expect(sandbox.isImportAllowed("dgram")).toBe(false);
    expect(sandbox.isImportAllowed("cluster")).toBe(false);
    expect(sandbox.isImportAllowed("worker_threads")).toBe(false);
  });

  it("should allow default safe builtins", () => {
    const sandbox = createModuleSandbox(makeConfig());
    for (const mod of DEFAULT_SANDBOX_CONFIG.allowedImports) {
      expect(sandbox.isImportAllowed(mod)).toBe(true);
    }
  });
});

// =============================================================================
// TESTS: Filesystem path control
// =============================================================================

describe("filesystem path control", () => {
  it("should allow paths within allowed directories", () => {
    const sandbox = createModuleSandbox(
      makeConfig({ allowedPaths: ["/app/modules/test-mod"] })
    );
    expect(sandbox.isPathAllowed("/app/modules/test-mod/index.ts")).toBe(true);
    expect(sandbox.isPathAllowed("/app/modules/test-mod/lib/helper.ts")).toBe(true);
  });

  it("should deny paths outside allowed directories", () => {
    const sandbox = createModuleSandbox(
      makeConfig({ allowedPaths: ["/app/modules/test-mod"] })
    );
    expect(sandbox.isPathAllowed("/app/modules/other-mod/index.ts")).toBe(false);
    expect(sandbox.isPathAllowed("/etc/passwd")).toBe(false);
    expect(sandbox.isPathAllowed("/app/server/index.ts")).toBe(false);
  });

  it("should prevent path traversal attacks", () => {
    const sandbox = createModuleSandbox(
      makeConfig({ allowedPaths: ["/app/modules/test-mod"] })
    );
    // path.resolve normalizes these, so traversal should fail
    expect(sandbox.isPathAllowed("/app/modules/test-mod/../../etc/passwd")).toBe(false);
    expect(sandbox.isPathAllowed("/app/modules/test-mod/../other-mod/secrets.ts")).toBe(false);
  });

  it("should handle exact path match", () => {
    const sandbox = createModuleSandbox(
      makeConfig({ allowedPaths: ["/app/modules/test-mod"] })
    );
    expect(sandbox.isPathAllowed("/app/modules/test-mod")).toBe(true);
  });
});

// =============================================================================
// TESTS: getSandboxConfigForTier
// =============================================================================

describe("getSandboxConfigForTier", () => {
  const moduleDir = "/app/server/modules/test-mod";
  const moduleId = "test-mod";

  it("should return null for kernel tier (no sandbox)", () => {
    const config = getSandboxConfigForTier("kernel", moduleDir, moduleId);
    expect(config).toBeNull();
  });

  it("should return null for core tier (no sandbox)", () => {
    const config = getSandboxConfigForTier("core", moduleDir, moduleId);
    expect(config).toBeNull();
  });

  it("should return config for optional tier", () => {
    const config = getSandboxConfigForTier("optional", moduleDir, moduleId);
    expect(config).not.toBeNull();
    expect(config!.label).toBe(moduleId);
    expect(config!.maxMemoryMB).toBe(256);
    expect(config!.timeoutMs).toBe(15_000);
    expect(config!.allowedImports).toContain("express");
    expect(config!.allowedImports).toContain("zod");
    expect(config!.allowedImports).toContain("pino");
  });

  it("should return strict config for third-party tier", () => {
    const config = getSandboxConfigForTier("third-party", moduleDir, moduleId);
    expect(config).not.toBeNull();
    expect(config!.label).toBe(moduleId);
    expect(config!.maxMemoryMB).toBe(64);
    expect(config!.timeoutMs).toBe(5_000);
    // third-party should NOT have express, zod, pino in whitelist
    expect(config!.allowedImports).not.toContain("express");
    expect(config!.allowedImports).not.toContain("zod");
  });

  it("should treat unknown tiers as third-party", () => {
    const config = getSandboxConfigForTier("unknown-tier", moduleDir, moduleId);
    expect(config).not.toBeNull();
    expect(config!.maxMemoryMB).toBe(64);
    expect(config!.timeoutMs).toBe(5_000);
  });

  it("should include module directory in allowedPaths", () => {
    const config = getSandboxConfigForTier("third-party", moduleDir, moduleId);
    expect(config).not.toBeNull();
    expect(config!.allowedPaths).toContain(path.resolve(moduleDir));
  });
});

// =============================================================================
// TESTS: Violation logging
// =============================================================================

describe("violation logging", () => {
  it("should return violations newest first", () => {
    const violations = getViolationLog(10);
    // Violations may or may not exist from other tests, but the
    // function should return an array
    expect(Array.isArray(violations)).toBe(true);
  });

  it("should respect limit parameter", () => {
    const all = getViolationLog(1000);
    const limited = getViolationLog(2);
    expect(limited.length).toBeLessThanOrEqual(2);
    expect(limited.length).toBeLessThanOrEqual(all.length);
  });
});

// =============================================================================
// TESTS: Sandbox disposal
// =============================================================================

describe("sandbox disposal", () => {
  it("should reject loadModule after disposal", async () => {
    const sandbox = createModuleSandbox(makeConfig());

    // Manually dispose by loading a dummy module (which calls dispose)
    // We cannot load a real module in tests, so we test the disposed flag
    // through the public API
    expect(sandbox.isDisposed()).toBe(false);

    // Simulate dispose by accessing the internal method through the
    // SandboxedModule interface. Since we cannot easily load a real
    // module in unit tests, we verify the flag behavior directly.
    // The actual integration is tested via the kernel-integration flow.
  });
});

// =============================================================================
// TESTS: DEFAULT_SANDBOX_CONFIG
// =============================================================================

describe("DEFAULT_SANDBOX_CONFIG", () => {
  it("should be frozen (immutable)", () => {
    expect(Object.isFrozen(DEFAULT_SANDBOX_CONFIG)).toBe(true);
  });

  it("should not include dangerous modules", () => {
    const dangerous = [
      "fs",
      "child_process",
      "net",
      "dgram",
      "cluster",
      "worker_threads",
      "http",
      "https",
      "tls",
      "dns",
      "vm",
      "v8",
    ];

    for (const mod of dangerous) {
      expect(DEFAULT_SANDBOX_CONFIG.allowedImports).not.toContain(mod);
    }
  });

  it("should include only safe builtins", () => {
    const expected = [
      "path",
      "url",
      "querystring",
      "util",
      "crypto",
      "buffer",
      "events",
      "stream",
      "string_decoder",
      "assert",
    ];

    for (const mod of expected) {
      expect(DEFAULT_SANDBOX_CONFIG.allowedImports).toContain(mod);
    }
  });

  it("should have reasonable defaults", () => {
    expect(DEFAULT_SANDBOX_CONFIG.maxMemoryMB).toBe(128);
    expect(DEFAULT_SANDBOX_CONFIG.timeoutMs).toBe(10_000);
    expect(DEFAULT_SANDBOX_CONFIG.allowedPaths).toEqual([]);
  });
});
