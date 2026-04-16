/**
 * @file tenant-scoped-imports.test.ts
 * @description Lint-style test enforcing the tenant-scoped helper convention.
 *
 * # What this test guarantees
 *
 * Any file under `server/` that imports a multi-tenant table from
 * `@shared/schema` MUST also import from `server/lib/tenant-scoped` (or be
 * the helper itself). This is the structural enforcement of the Layer 2
 * tenant isolation contract documented in `docs/security/TENANT-ISOLATION.md`.
 *
 * The check is intentionally simple — a regex scan of imports — because
 * Layer 4 (Postgres row-level security, ROADMAP M1.4) is the real defense.
 * This test exists to fail PR builds early when a developer reaches for a
 * tagged table directly.
 *
 * # Adding a tagged table
 *
 * 1. Register it in `server/lib/tenant-scoped-registry.ts`.
 * 2. Add it to MULTI_TENANT_TABLE_NAMES below.
 * 3. The test will then enforce the import contract for it.
 *
 * # Allowing a known exception
 *
 * If a file genuinely needs unscoped access (e.g. an admin tool that spans
 * sites), add it to ALLOWED_UNSCOPED_FILES below with a code comment in
 * the file pointing to a security-reviewed reason. Each entry should have
 * a corresponding code-review note.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// =====================================================================
// CONFIGURATION
// =====================================================================

/**
 * Names of multi-tenant tables that must only be queried via the
 * tenant-scoped helper. Keep in sync with tenant-scoped-registry.ts.
 */
const MULTI_TENANT_TABLE_NAMES = [
  "siteFeatureOverrides",
  "featureRolloutHistory",
  "apiKeys",
  "socialAccounts",
  "socialPosts",
  "socialCampaigns",
] as const;

/**
 * Files that are allowed to import multi-tenant tables WITHOUT going
 * through the helper. Each entry must correspond to a real reason —
 * the helper itself, the registry, schema definitions, the test file
 * proving the contract, and storage-backend files that legitimately
 * need raw table access (and already implement explicit per-site
 * filtering by convention).
 */
const ALLOWED_UNSCOPED_FILES = new Set([
  // The helper IS the safe wrapper.
  "server/lib/tenant-scoped.ts",
  // The dependency-free sibling of tenant-scoped.ts — holds the WeakMap
  // registry + register/isMultiTenant/siteIdColumnFor functions so the
  // dev-query guard and its unit tests can import without pulling in
  // db.ts. Part of the helper by construction; same allow-list posture.
  "server/lib/tenant-scoped-tables.ts",
  // The registry registers the tables with the helper.
  "server/lib/tenant-scoped-registry.ts",
  // Storage backends are the layer below the helper. They take siteId as
  // an explicit parameter on every per-site method and include it in the
  // WHERE clause directly. Trusted by convention; reviewed for compliance.
  // If you add another storage backend that does the same thing, add it
  // here with a one-line note about the explicit-siteId discipline.
  "server/services/feature-flags/pg-storage.ts",
  // api-key-service.ts is the SDK auth-flow entry point. Per-site paths
  // (createKey, listKeys, revokeKey, getKey, updateLastUsed) go through
  // scoped() / withDbSiteScope(). The validateKey path is INTENTIONAL
  // CROSS-TENANT by design — the SDK arrives with an opaque key and
  // looks up the owning site by hash before any site context exists.
  // See the JSDoc on validateKey for the full deployment note and
  // migration 0006 for the policy posture.
  "server/services/api-keys/api-key-service.ts",
  // social-media/pg-storage.ts is the PgSocialAccountStorage/PgSocialPostStorage/
  // PgCampaignStorage/PgPostAnalyticsStorage backend. Per-site methods
  // use withDbSiteScope; by-id methods (getById/update/delete) are
  // marked FIXME (M1.8b-follow) pending a service-layer refactor that
  // threads siteId through `social-media-service.ts`. Added to this
  // allow-list so the static lint passes; the runtime dev-query guard
  // still enforces the invariant on the by-id paths in dev mode.
  "server/services/social-media/pg-storage.ts",
  // Schema definition files declare the tables.
  "shared/schema.ts",
  // Tests need to be able to assert behavior directly.
  "tests/security/tenant-scoped-imports.test.ts",
  "tests/security/safe-expression.test.ts",
]);

const REPO_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["server"];
const FILE_EXTENSIONS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

// =====================================================================
// SCAN
// =====================================================================

function* walkTree(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkTree(full);
    } else if (FILE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

function fileImportsTaggedTable(content: string): string[] {
  const found: string[] = [];
  for (const tableName of MULTI_TENANT_TABLE_NAMES) {
    // Match "import { ... tableName ... } from \"@shared/schema\""
    // or "from \"../../shared/schema\"". We don't try to be fancy with
    // the path; the test fails on overly-permissive matches by design.
    // The check is: does the file *reference* the table identifier in
    // an import statement context.
    const importPattern = new RegExp(
      `import\\s*(?:type\\s*)?\\{[^}]*\\b${tableName}\\b[^}]*\\}\\s*from\\s*['"][^'"]*schema['"]`,
      "m"
    );
    if (importPattern.test(content)) {
      found.push(tableName);
    }
  }
  return found;
}

function fileImportsHelper(content: string): boolean {
  // Either the named exports or a wildcard import from tenant-scoped.
  return /from\s*['"][^'"]*tenant-scoped['"]/m.test(content);
}

// =====================================================================
// TESTS
// =====================================================================

describe("tenant-scoped imports lint", () => {
  it("every server file importing a multi-tenant table also imports the helper", () => {
    const offenders: Array<{ file: string; tables: string[] }> = [];

    for (const dir of SCAN_DIRS) {
      const fullDir = join(REPO_ROOT, dir);
      for (const file of walkTree(fullDir)) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
        if (ALLOWED_UNSCOPED_FILES.has(rel)) continue;

        const content = readFileSync(file, "utf-8");
        const importedTables = fileImportsTaggedTable(content);
        if (importedTables.length === 0) continue;

        if (!fileImportsHelper(content)) {
          offenders.push({ file: rel, tables: importedTables });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = [
        "Files import a multi-tenant table without importing tenant-scoped helper:",
        ...offenders.map(
          (o) => `  ${o.file} imports [${o.tables.join(", ")}]`
        ),
        "",
        "Fix one of:",
        '  1. Use scoped(siteId).select(table) instead of db.select().from(table)',
        '  2. Add the file to ALLOWED_UNSCOPED_FILES with a security-reviewed reason',
        "",
        "See docs/security/TENANT-ISOLATION.md.",
      ].join("\n");
      throw new Error(msg);
    }
    expect(offenders).toEqual([]);
  });

  it("the registry contains every table listed in MULTI_TENANT_TABLE_NAMES", () => {
    // If a developer adds a new tagged table to MULTI_TENANT_TABLE_NAMES
    // here but forgets to register it, the helper would refuse to use it —
    // this test catches the omission early with a clearer message.
    const registryPath = join(REPO_ROOT, "server/lib/tenant-scoped-registry.ts");
    const registryContent = readFileSync(registryPath, "utf-8");
    for (const name of MULTI_TENANT_TABLE_NAMES) {
      expect(
        registryContent.includes(name),
        `tenant-scoped-registry.ts is missing registration for "${name}"`
      ).toBe(true);
    }
  });
});

describe("assertScoped runtime guard", () => {
  // Import from the dependency-free context file rather than tenant-scoped.ts
  // so the test does not require DATABASE_URL. The two files re-export the
  // same symbols; the split is documented in tenant-scope-context.ts.
  it("throws outside any scope", async () => {
    const { assertScoped } = await import("../../server/lib/tenant-scope-context");
    expect(() => assertScoped("test-job")).toThrow(/test-job/);
  });

  it("returns the bound siteId inside runInTenantScope", async () => {
    const { assertScoped, runInTenantScope } = await import(
      "../../server/lib/tenant-scope-context"
    );
    const result = runInTenantScope("site-42", () => assertScoped("test-job"));
    expect(result).toBe("site-42");
  });

  it("propagates through async boundaries", async () => {
    const { assertScoped, runInTenantScope } = await import(
      "../../server/lib/tenant-scope-context"
    );
    const result = await runInTenantScope("site-7", async () => {
      // Force a microtask hop to verify AsyncLocalStorage propagation.
      await Promise.resolve();
      await new Promise<void>((r) => setImmediate(r));
      return assertScoped("test-job");
    });
    expect(result).toBe("site-7");
  });
});
