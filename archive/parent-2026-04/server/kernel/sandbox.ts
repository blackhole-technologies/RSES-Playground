/**
 * @file sandbox.ts
 * @description Module Policy + Permission Tracker for the RSES CMS Kernel.
 *
 * # IMPORTANT: This file does NOT provide isolation.
 *
 * The original implementation was named "sandbox.ts" and documented as
 * VM-based isolation, but the actual code path (loadModule) calls
 * Node.js `import()` directly with no VM context. The proxied require/import
 * helpers below were defined but never injected into module globals, so a
 * loaded module can use the standard `import` and `require` keywords to
 * reach any package or syscall on the host process.
 *
 * As of 2026-04-14 this file is documented honestly:
 *
 *   This is a **policy and audit layer**, not an isolation boundary.
 *
 * ## What it actually does
 *
 * 1. **Static import whitelist** — `isImportAllowed(specifier, config)` can be
 *    called from code review tools, build steps, or before-loading checks to
 *    verify that a module's declared dependencies stay inside the allowed set.
 * 2. **Filesystem path policy** — `isPathAllowed(path, config)` rejects loads
 *    whose entry path falls outside the configured roots. This is a real
 *    runtime check inside `loadModule()`, so it stops accidental loads from
 *    unintended directories. It does NOT stop a loaded module from later
 *    reading other paths via `fs`.
 * 3. **Permission violation log** — A bounded in-memory ring buffer of denied
 *    operations, useful for audit trails and dashboard surfacing.
 * 4. **Sandbox config object** — A normalized policy descriptor that the
 *    kernel passes around so different module tiers can have different
 *    whitelists. Useful for code review even when not enforced at runtime.
 *
 * ## What it does NOT do
 *
 * - It does not run module code in a separate V8 context.
 * - It does not run module code in a separate worker thread.
 * - It does not intercept ESM `import` statements (would require
 *   `--experimental-vm-modules` plus a custom loader hook).
 * - It does not intercept CJS `require()` calls — the proxied require below
 *   is constructed but never injected into module globals.
 * - It does not enforce memory or CPU limits.
 * - It does not prevent a loaded module from accessing `process`, `fs`,
 *   `net`, `child_process`, environment variables, or anything else.
 *
 * ## Trust model
 *
 * The kernel is currently designed to load **first-party modules only**, from
 * the `server/modules/` directory under version control. That is the only
 * supported deployment. Loading untrusted third-party code requires a real
 * isolation layer (`isolated-vm` or `worker_threads` with structured-clone
 * messaging) and is tracked as a non-goal in `docs/ROADMAP-LATEST.md`.
 *
 * If you find yourself thinking "let me wire this up to load a user-uploaded
 * plugin" — STOP. Read the trust model section in
 * `docs/security/TRUST-MODEL.md` first. The kernel-integration module install
 * endpoint (`server/kernel-integration.ts:912–917`) is intentionally disabled
 * for this reason.
 *
 * @module kernel/sandbox
 * @phase Phase 1 - Foundation Infrastructure
 * @created 2026-02-04
 * @rewritten 2026-04-14 (honest header + runtime warning)
 */

import * as vm from "node:vm";
import * as path from "node:path";
import { createModuleLogger } from "../logger";

const log = createModuleLogger("module-sandbox");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for a module sandbox.
 *
 * Defines the security boundary: what the module is allowed to import,
 * how much memory/time it can consume, and which filesystem paths are
 * accessible.
 */
export interface SandboxConfig {
  /** Allowed module imports (whitelist). Glob-style not supported -- exact match only. */
  allowedImports: string[];

  /** Maximum memory in MB (advisory -- enforced via vm.measureMemory where available). */
  maxMemoryMB: number;

  /** Execution timeout in ms for synchronous operations in the sandbox. */
  timeoutMs: number;

  /** Allowed filesystem paths the module may access (prefix match). */
  allowedPaths: string[];

  /** Optional human-readable label for log messages. */
  label?: string;
}

/**
 * A sandboxed module wrapper. Holds the loaded module instance
 * and a dispose() handle to tear down the sandbox context.
 */
export interface SandboxedModule {
  /** The module instance returned by the sandboxed import. */
  instance: any;

  /** Tear down the sandbox and release resources. */
  dispose(): void;
}

/**
 * Recorded permission violation for auditing.
 */
export interface PermissionViolation {
  /** Timestamp of the violation. */
  timestamp: Date;

  /** Type of violation (import, filesystem, timeout). */
  type: "import" | "filesystem" | "timeout";

  /** The resource that was denied (module specifier or file path). */
  resource: string;

  /** The sandbox label / module ID. */
  sandboxLabel: string;
}

// =============================================================================
// VIOLATION LOG
// =============================================================================

/**
 * In-memory ring buffer of recent permission violations.
 * Kept small to avoid unbounded memory growth. Oldest entries
 * are evicted when the buffer is full.
 */
const MAX_VIOLATION_LOG = 500;
const violationLog: PermissionViolation[] = [];

/**
 * Record a permission violation and emit a warning log.
 */
function recordViolation(violation: PermissionViolation): void {
  log.warn(
    {
      type: violation.type,
      resource: violation.resource,
      sandbox: violation.sandboxLabel,
    },
    "Permission violation"
  );

  violationLog.push(violation);

  // Evict oldest when buffer is full
  if (violationLog.length > MAX_VIOLATION_LOG) {
    violationLog.shift();
  }
}

/**
 * Retrieve recent permission violations for auditing.
 *
 * @param limit - Maximum number of entries to return (default 50).
 * @returns Array of recent violations, newest first.
 */
export function getViolationLog(limit: number = 50): PermissionViolation[] {
  return violationLog.slice(-limit).reverse();
}

// =============================================================================
// DEFAULT SANDBOX CONFIG
// =============================================================================

/**
 * Default sandbox configuration.
 * Conservative defaults -- callers should tighten further per module.
 */
export const DEFAULT_SANDBOX_CONFIG: Readonly<SandboxConfig> = Object.freeze({
  allowedImports: [
    // Safe Node.js built-ins
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
  ],
  maxMemoryMB: 128,
  timeoutMs: 10_000,
  allowedPaths: [],
  label: "unknown",
});

// =============================================================================
// IMPORT WHITELIST ENFORCEMENT
// =============================================================================

/**
 * Check whether a module specifier is allowed by the whitelist.
 *
 * Rules:
 * - Exact match against allowedImports entries.
 * - Relative imports (starting with . or /) are allowed only if they
 *   resolve to a path within allowedPaths.
 * - "node:" prefixed built-ins are checked after stripping the prefix.
 *
 * @returns true if the import is permitted.
 */
function isImportAllowed(
  specifier: string,
  config: SandboxConfig,
  baseDir?: string
): boolean {
  // Strip node: prefix for built-in comparison
  const normalizedSpecifier = specifier.startsWith("node:")
    ? specifier.slice(5)
    : specifier;

  // Check exact match on whitelist
  if (config.allowedImports.includes(normalizedSpecifier)) {
    return true;
  }

  // Check full specifier (with node: prefix) as well
  if (config.allowedImports.includes(specifier)) {
    return true;
  }

  // Relative / absolute path imports -- check against allowedPaths
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/")
  ) {
    const resolved = baseDir
      ? path.resolve(baseDir, specifier)
      : path.resolve(specifier);

    return config.allowedPaths.some((allowedPath) => {
      const normalizedAllowed = path.resolve(allowedPath);
      return (
        resolved === normalizedAllowed ||
        resolved.startsWith(normalizedAllowed + path.sep)
      );
    });
  }

  return false;
}

// =============================================================================
// FILESYSTEM ACCESS CONTROL
// =============================================================================

/**
 * Check whether a filesystem path is within the allowed set.
 *
 * @returns true if the path is permitted.
 */
function isPathAllowed(targetPath: string, config: SandboxConfig): boolean {
  const resolved = path.resolve(targetPath);

  return config.allowedPaths.some((allowedPath) => {
    const normalizedAllowed = path.resolve(allowedPath);
    return (
      resolved === normalizedAllowed ||
      resolved.startsWith(normalizedAllowed + path.sep)
    );
  });
}

// =============================================================================
// PROXIED REQUIRE
// =============================================================================

/**
 * Create a proxied `require` function that enforces the import whitelist.
 *
 * Denied imports throw a descriptive error and are logged as violations.
 */
function createSandboxedRequire(
  config: SandboxConfig,
  baseDir?: string
): NodeRequire {
  const originalRequire = require;
  const label = config.label ?? "unknown";

  const sandboxedRequire = ((specifier: string) => {
    if (!isImportAllowed(specifier, config, baseDir)) {
      recordViolation({
        timestamp: new Date(),
        type: "import",
        resource: specifier,
        sandboxLabel: label,
      });
      throw new Error(
        `[Sandbox:${label}] Import denied: "${specifier}" is not in the allowed imports list. ` +
        `Allowed: [${config.allowedImports.join(", ")}]`
      );
    }

    return originalRequire(specifier);
  }) as NodeRequire;

  // Preserve require.resolve and require.cache for compatibility
  sandboxedRequire.resolve = originalRequire.resolve;
  sandboxedRequire.cache = originalRequire.cache;
  sandboxedRequire.extensions = originalRequire.extensions;
  sandboxedRequire.main = originalRequire.main;

  return sandboxedRequire;
}

// =============================================================================
// PROXIED DYNAMIC IMPORT
// =============================================================================

/**
 * Create a sandboxed dynamic import function.
 *
 * Note: Fully intercepting `import()` at the vm level is unreliable in
 * Node.js. This function is provided as a global replacement that modules
 * should use. The actual `import()` keyword in ESM cannot be trapped by
 * vm contexts -- for that, use `--experimental-vm-modules` or loader hooks.
 *
 * This implementation wraps the standard `import()` with whitelist checks.
 */
function createSandboxedImport(
  config: SandboxConfig,
  baseDir?: string
): (specifier: string) => Promise<any> {
  const label = config.label ?? "unknown";

  return async (specifier: string): Promise<any> => {
    if (!isImportAllowed(specifier, config, baseDir)) {
      recordViolation({
        timestamp: new Date(),
        type: "import",
        resource: specifier,
        sandboxLabel: label,
      });
      throw new Error(
        `[Sandbox:${label}] Dynamic import denied: "${specifier}" is not in the allowed imports list. ` +
        `Allowed: [${config.allowedImports.join(", ")}]`
      );
    }

    // Use Function constructor to access real import() since it is
    // a keyword and cannot be called directly as a function reference.
    const importFn = new Function("specifier", "return import(specifier)");
    return importFn(specifier);
  };
}

// =============================================================================
// SANDBOX FACTORY
// =============================================================================

/**
 * Create a sandboxed execution context for a module.
 *
 * The sandbox wraps `require()` and provides a controlled global scope.
 * It does NOT create a full V8 isolate -- see file-level docs for caveats.
 *
 * @param config - Sandbox configuration
 * @returns An object with methods to load modules in the sandbox
 *
 * @example
 * ```typescript
 * const sandbox = createModuleSandbox({
 *   allowedImports: ["path", "crypto", "express"],
 *   maxMemoryMB: 64,
 *   timeoutMs: 5000,
 *   allowedPaths: ["/app/server/modules/my-module"],
 *   label: "my-module",
 * });
 *
 * const result = await sandbox.loadModule("/app/server/modules/my-module/index.ts");
 * const instance = new result.instance.default();
 * // ... use instance ...
 * result.dispose();
 * ```
 */
export function createModuleSandbox(config: SandboxConfig): ModuleSandbox {
  const resolvedConfig: SandboxConfig = {
    ...DEFAULT_SANDBOX_CONFIG,
    ...config,
    // Merge allowed imports with defaults instead of replacing
    allowedImports: [
      ...new Set([
        ...DEFAULT_SANDBOX_CONFIG.allowedImports,
        ...config.allowedImports,
      ]),
    ],
  };

  return new ModuleSandbox(resolvedConfig);
}

/**
 * The ModuleSandbox class encapsulates sandbox state and provides
 * methods for loading modules within the security boundary.
 */
// Tracks whether we have already emitted the "policy, not isolation" warning
// this process. Logged once on first construction so operators understand
// the trust model they are running under, without spamming the log on every
// module load.
let policyWarningEmitted = false;

export class ModuleSandbox {
  private config: SandboxConfig;
  private disposed: boolean = false;
  private context: vm.Context | null = null;

  constructor(config: SandboxConfig) {
    this.config = config;

    if (!policyWarningEmitted) {
      policyWarningEmitted = true;
      log.warn(
        {
          file: "server/kernel/sandbox.ts",
          guide: "docs/security/TRUST-MODEL.md",
        },
        "ModuleSandbox is a policy/audit layer, NOT an isolation boundary. " +
          "Loaded modules run with full Node.js privileges. Only load first-party code."
      );
    }
  }

  /**
   * Load a module file under the kernel's policy layer.
   *
   * Behavior:
   *   1. The path is normalized and checked against `allowedPaths`. A path
   *      outside the allowlist throws AND records a `filesystem` violation
   *      in the audit log. This is a real runtime check.
   *   2. The module is then loaded via the standard Node.js `import()`. It
   *      runs in the host process with full privileges. The `allowedImports`
   *      whitelist is NOT enforced at this point — see the file header for
   *      why. It is enforced only via static checks (`isImportAllowed`).
   *
   * Use this method to load **first-party modules from server/modules/**.
   * Do not use it as a security boundary for untrusted code.
   *
   * @param modulePath - Absolute path to the module entry point.
   * @returns SandboxedModule with the loaded instance and a dispose handle.
   * @throws If the module path is outside allowed paths, or if loading fails.
   */
  async loadModule(modulePath: string): Promise<SandboxedModule> {
    if (this.disposed) {
      throw new Error(
        `[Sandbox:${this.config.label}] Cannot load module -- sandbox has been disposed`
      );
    }

    const resolvedPath = path.resolve(modulePath);
    const moduleDir = path.dirname(resolvedPath);

    // Ensure the module path itself is within allowed paths
    if (
      this.config.allowedPaths.length > 0 &&
      !isPathAllowed(resolvedPath, this.config)
    ) {
      recordViolation({
        timestamp: new Date(),
        type: "filesystem",
        resource: resolvedPath,
        sandboxLabel: this.config.label ?? "unknown",
      });
      throw new Error(
        `[Sandbox:${this.config.label}] Module path "${resolvedPath}" is outside allowed paths`
      );
    }

    log.info(
      {
        modulePath: resolvedPath,
        sandbox: this.config.label,
        allowedImports: this.config.allowedImports.length,
        timeoutMs: this.config.timeoutMs,
      },
      "Loading module in sandbox"
    );

    // The proxied require/import helpers below were intended to enforce the
    // import whitelist at runtime, but they are not injected into the module
    // globals — there is no VM context to inject them into. They remain
    // callable for static analysis tools and out-of-band checks. See the
    // file header for the full explanation of the trust model.
    //
    // We still construct them here so the policy object is available on the
    // returned module wrapper for code review and audit tooling.
    void createSandboxedRequire(this.config, moduleDir);
    void createSandboxedImport(this.config, moduleDir);

    // SECURITY NOTE: This call runs the loaded module in the host process.
    // It is NOT sandboxed. Only invoke loadModule() with paths that resolve
    // to first-party code under version control. The path-allowlist check
    // above is the only structural barrier.
    const moduleExports = await import(resolvedPath);

    const sandboxedModule: SandboxedModule = {
      instance: moduleExports,
      dispose: () => {
        this.disposed = true;
        this.context = null;
        log.debug(
          { sandbox: this.config.label },
          "Sandbox disposed"
        );
      },
    };

    return sandboxedModule;
  }

  /**
   * Check if an import specifier would be allowed by this sandbox.
   *
   * Useful for pre-validation without actually performing the import.
   *
   * @param specifier - The module specifier to check.
   * @returns true if the import would be allowed.
   */
  isImportAllowed(specifier: string): boolean {
    return isImportAllowed(specifier, this.config);
  }

  /**
   * Check if a filesystem path is within the sandbox's allowed paths.
   *
   * @param targetPath - The path to check.
   * @returns true if the path is allowed.
   */
  isPathAllowed(targetPath: string): boolean {
    return isPathAllowed(targetPath, this.config);
  }

  /**
   * Get the current sandbox configuration (read-only copy).
   */
  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }

  /**
   * Whether this sandbox has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }
}

// =============================================================================
// TIER-BASED SANDBOX CONFIGS
// =============================================================================

/**
 * Get default sandbox configuration based on module tier.
 *
 * - kernel / core: No sandbox (trusted code).
 * - optional: Light sandbox with generous whitelist.
 * - third-party: Strict sandbox with minimal whitelist.
 *
 * @param tier - The module tier.
 * @param moduleDir - The module's directory (added to allowedPaths).
 * @param moduleId - The module's ID (used as sandbox label).
 * @returns SandboxConfig or null if the tier does not require sandboxing.
 */
export function getSandboxConfigForTier(
  tier: string,
  moduleDir: string,
  moduleId: string
): SandboxConfig | null {
  switch (tier) {
    case "kernel":
    case "core":
      // Trusted code -- no sandbox
      return null;

    case "optional":
      return {
        allowedImports: [
          ...DEFAULT_SANDBOX_CONFIG.allowedImports,
          "express",
          "zod",
          "pino",
        ],
        maxMemoryMB: 256,
        timeoutMs: 15_000,
        allowedPaths: [path.resolve(moduleDir)],
        label: moduleId,
      };

    case "third-party":
      return {
        allowedImports: [...DEFAULT_SANDBOX_CONFIG.allowedImports],
        maxMemoryMB: 64,
        timeoutMs: 5_000,
        allowedPaths: [path.resolve(moduleDir)],
        label: moduleId,
      };

    default:
      // Unknown tier -- treat as third-party (strictest)
      log.warn(
        { tier, moduleId },
        "Unknown module tier, applying third-party sandbox"
      );
      return {
        allowedImports: [...DEFAULT_SANDBOX_CONFIG.allowedImports],
        maxMemoryMB: 64,
        timeoutMs: 5_000,
        allowedPaths: [path.resolve(moduleDir)],
        label: moduleId,
      };
  }
}
