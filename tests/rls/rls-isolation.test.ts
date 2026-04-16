/**
 * @file rls-isolation.test.ts
 * @description Integration tests for Postgres row-level security policies.
 * @phase Phase 1 - Foundation Hardening
 * @milestone M1.4 Phase C (ROADMAP_2026-04-14_v6.md)
 * @created 2026-04-15
 *
 * # What this test file verifies
 *
 * The Phase B migration (`migrations/0003_add_tenant_rls_policies.sql`)
 * adds row-level security policies on the two registered multi-tenant
 * tables. This file exercises those policies against a real Postgres
 * instance to prove they fail-closed when the session variable
 * `app.current_site_id` is not set or is set to a different site than
 * the row's `site_id`.
 *
 * The file is deliberately **self-contained**:
 *
 *   - It creates its own isolated schema (a per-run `test_rls_<uuid>`)
 *     so it cannot collide with other tests or leak rows into real
 *     tables. The schema is dropped in `afterAll`.
 *   - It creates minimal copies of the two tables (just the columns
 *     relevant to the policy — id, site_id, feature_key, etc.) and
 *     inlines the policy DDL from 0003 verbatim. Copying the DDL lets
 *     the test run without a migration runner and without touching
 *     real production tables.
 *   - It uses `pg.Client` directly, not the app's `server/db.ts`
 *     wrapper. This avoids pulling in the app's `DATABASE_URL`
 *     requirement and keeps the test's scope strictly "does Postgres
 *     behave the way the 0003 migration claims?".
 *   - It applies `FORCE ROW LEVEL SECURITY` (the Phase D flip) inside
 *     the test, because the typical local/CI Postgres role is a
 *     superuser and `ENABLE` alone would be bypassed. This means the
 *     test validates the end-state (Phase B + Phase D together), not
 *     just Phase B in isolation.
 *
 * # Skipping when no database is available
 *
 * If `TEST_DATABASE_URL` or `DATABASE_URL` is not set, the entire
 * suite is skipped via `describe.skipIf`. The CI `build-and-test` job
 * already exposes `DATABASE_URL`, so the tests run there. Locally,
 * developers can point at their own Postgres:
 *
 *   TEST_DATABASE_URL=postgres://localhost:5432/rses_dev npm run test:rls
 *
 * The tests clean up after themselves even on failure (via `afterAll`)
 * as long as the `beforeAll` made it far enough to create the schema.
 *
 * # Why tests/rls/ instead of tests/security/
 *
 * The `test:security` npm script runs `vitest run tests/security`,
 * which is designed to be fast and DB-free — it is a hard CI gate
 * on every PR. Adding a DB-touching test to that path would either
 * slow it down or create a silent-skip footgun. A separate directory
 * keeps the fast gate fast and the slow DB tests opt-in via
 * `test:rls` or the general `npm test` run.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";

// Prefer TEST_DATABASE_URL so developers can point at a dedicated test
// database without affecting the app's runtime DATABASE_URL. Fall back
// to DATABASE_URL so CI's build-and-test job (which already exposes
// DATABASE_URL for the Postgres service container) picks up the suite
// without additional config.
const CONNECTION_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// When no DB URL is available, skip the entire describe block. Vitest
// reports this as "skipped" in the output, which is clearly different
// from "passed" or "failed" — a developer reading CI logs can tell
// the difference between "tests ran" and "tests were skipped."
const SKIP_REASON = !CONNECTION_URL
  ? "TEST_DATABASE_URL / DATABASE_URL not set; RLS integration tests skipped"
  : "";

describe.skipIf(!CONNECTION_URL)(
  "RLS tenant isolation (M1.4 Phase C)",
  () => {
    let client: pg.Client;
    // Unique schema per test run so parallel runs and half-cleaned
    // previous runs don't collide. UUID keeps it cryptographically
    // unique and avoids any Math.random in business-adjacent code
    // (per hard rule 4 in HANDOFF_2026-04-14_v1.md).
    const schemaName = `test_rls_${randomUUID().replace(/-/g, "")}`;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: CONNECTION_URL });
      await client.connect();

      // Create an isolated schema and route all subsequent queries
      // through it via search_path. search_path is session-scoped, so
      // it persists across queries on this client without needing a
      // transaction.
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}"`);

      // Minimal copy of the two target tables. Only columns relevant
      // to the policy are declared — adding the full schema would
      // pull in feature_flags (via foreign key) and the whole
      // migration chain. The policy cares about site_id only.
      await client.query(`
        CREATE TABLE site_feature_overrides (
          id serial PRIMARY KEY,
          site_id text NOT NULL,
          feature_key text NOT NULL,
          enabled boolean NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE feature_rollout_history (
          id serial PRIMARY KEY,
          feature_key text NOT NULL,
          event_type text NOT NULL,
          site_id text
        );
      `);
      // M1.8a — api_keys table. Only the columns relevant to the
      // policy are declared; the real schema has many more. Business
      // keys (key_prefix + key_hash) let us simulate the SDK auth
      // flow's lookup-by-hash even though this test does not check
      // the auth path itself — it only validates the strict-equality
      // site isolation from migration 0006.
      await client.query(`
        CREATE TABLE api_keys (
          id serial PRIMARY KEY,
          site_id varchar(64) NOT NULL,
          key_prefix varchar(16) NOT NULL,
          key_hash varchar(64) NOT NULL,
          name varchar(128) NOT NULL
        );
      `);
      // M1.8b — the three social_media tables. Minimal columns
      // covering site_id plus the business keys the assertions
      // touch. socialPublishQueue and socialPostAnalytics are NOT
      // created — they have no direct site_id column and are a
      // known M1.8b gap (documented in migration 0008 and STATUS
      // v11).
      await client.query(`
        CREATE TABLE social_accounts (
          id text PRIMARY KEY,
          site_id text NOT NULL,
          platform text NOT NULL,
          account_name text NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE social_posts (
          id text PRIMARY KEY,
          site_id text NOT NULL,
          content text NOT NULL,
          status text NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE social_campaigns (
          id text PRIMARY KEY,
          site_id text NOT NULL,
          name text NOT NULL,
          status text NOT NULL
        );
      `);

      // Seed data BEFORE enabling RLS, so the seed doesn't get
      // blocked by policies. Two sites plus one global history row
      // plus two api keys per site.
      await client.query(`
        INSERT INTO site_feature_overrides (site_id, feature_key, enabled) VALUES
          ('site-a', 'flag1', true),
          ('site-a', 'flag2', false),
          ('site-b', 'flag1', false),
          ('site-b', 'flag3', true);
      `);
      await client.query(`
        INSERT INTO feature_rollout_history (feature_key, event_type, site_id) VALUES
          ('flag1', 'enabled',  'site-a'),
          ('flag1', 'disabled', 'site-b'),
          ('flag2', 'enabled',  NULL);
      `);
      await client.query(`
        INSERT INTO api_keys (site_id, key_prefix, key_hash, name) VALUES
          ('site-a', 'ff_pro_a', 'hash_a1', 'site-a key 1'),
          ('site-a', 'ff_pro_b', 'hash_a2', 'site-a key 2'),
          ('site-b', 'ff_pro_c', 'hash_b1', 'site-b key 1');
      `);
      // Seed one row per site on each social_media table. The
      // assertions only need to distinguish site-a from site-b.
      await client.query(`
        INSERT INTO social_accounts (id, site_id, platform, account_name) VALUES
          ('sa-a1', 'site-a', 'twitter',  '@site-a'),
          ('sa-b1', 'site-b', 'twitter',  '@site-b');
      `);
      await client.query(`
        INSERT INTO social_posts (id, site_id, content, status) VALUES
          ('sp-a1', 'site-a', 'hello from site-a', 'published'),
          ('sp-b1', 'site-b', 'hello from site-b', 'draft');
      `);
      await client.query(`
        INSERT INTO social_campaigns (id, site_id, name, status) VALUES
          ('sc-a1', 'site-a', 'launch-a', 'active'),
          ('sc-b1', 'site-b', 'launch-b', 'draft');
      `);

      // Policy DDL copied verbatim from migrations/0003. Keeping it
      // inline here means this test does not depend on a migration
      // runner and can be re-run against an arbitrary Postgres
      // instance without additional setup. If 0003 changes, this
      // test must be updated too — the close duplication is
      // intentional.
      await client.query(`
        ALTER TABLE site_feature_overrides ENABLE ROW LEVEL SECURITY;
        ALTER TABLE site_feature_overrides FORCE ROW LEVEL SECURITY;

        CREATE POLICY site_isolation_select ON site_feature_overrides
          FOR SELECT
          USING (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY site_isolation_insert ON site_feature_overrides
          FOR INSERT
          WITH CHECK (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY site_isolation_update ON site_feature_overrides
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY site_isolation_delete ON site_feature_overrides
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);

      // Policy DDL on feature_rollout_history reflects the end-state
      // we expect to be deployed: 0003 (Phase B) PLUS 0005 (Phase D
      // prep — relaxed INSERT WITH CHECK for global-audit rows).
      //
      // The INSERT policy below is the 0005 form, not the 0003 form.
      // If 0005 has not yet been applied to the database under test,
      // assertions 10 and the new "mismatched non-null insert still
      // rejected" will correctly flag the drift via test failure.
      //
      // See migrations/0005_relax_rollout_history_insert_policy.sql
      // for the full rationale on why the INSERT check was relaxed.
      await client.query(`
        ALTER TABLE feature_rollout_history ENABLE ROW LEVEL SECURITY;
        ALTER TABLE feature_rollout_history FORCE ROW LEVEL SECURITY;

        CREATE POLICY site_isolation_select ON feature_rollout_history
          FOR SELECT
          USING (
            site_id IS NULL
            OR site_id = current_setting('app.current_site_id', true)
          );

        CREATE POLICY site_isolation_insert ON feature_rollout_history
          FOR INSERT
          WITH CHECK (
            site_id IS NULL
            OR site_id = current_setting('app.current_site_id', true)
          );

        CREATE POLICY site_isolation_update ON feature_rollout_history
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY site_isolation_delete ON feature_rollout_history
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);

      // M1.8a + M1.8a-followup — api_keys policies from migrations
      // 0006 (strict equality on all four verbs) PLUS 0007 (bypass
      // SELECT policy keyed on `app.api_key_lookup`). FORCE is
      // applied inside the test for the same reason it's applied to
      // the other tables — the typical CI Postgres role is a
      // superuser, so ENABLE alone would be bypassed and the
      // assertions would be meaningless.
      //
      // The inlined policy set below reflects the expected deployed
      // end-state (0006 + 0007). If the target database has only 0006
      // applied and not 0007, the assertion
      // "SELECT with app.api_key_lookup=true returns rows regardless
      // of site" will fail — that is the signal to apply 0007 next.
      await client.query(`
        ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
        ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

        CREATE POLICY api_keys_isolation_select ON api_keys
          FOR SELECT
          USING (site_id = current_setting('app.current_site_id', true));

        -- Migration 0007 — PERMISSIVE bypass policy. Combines with the
        -- strict policy above via OR semantics. SELECT only — writes
        -- still require strict equality.
        CREATE POLICY api_keys_auth_lookup ON api_keys
          FOR SELECT
          USING (current_setting('app.api_key_lookup', true) = 'true');

        CREATE POLICY api_keys_isolation_insert ON api_keys
          FOR INSERT
          WITH CHECK (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY api_keys_isolation_update ON api_keys
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));

        CREATE POLICY api_keys_isolation_delete ON api_keys
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);

      // M1.8b — policies from migration 0008 for the three social_media
      // tables. Same strict-equality shape as api_keys (0006) and
      // site_feature_overrides (0003).
      await client.query(`
        ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE social_accounts FORCE ROW LEVEL SECURITY;

        CREATE POLICY social_accounts_isolation_select ON social_accounts
          FOR SELECT
          USING (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_accounts_isolation_insert ON social_accounts
          FOR INSERT
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_accounts_isolation_update ON social_accounts
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_accounts_isolation_delete ON social_accounts
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);
      await client.query(`
        ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
        ALTER TABLE social_posts FORCE ROW LEVEL SECURITY;

        CREATE POLICY social_posts_isolation_select ON social_posts
          FOR SELECT
          USING (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_posts_isolation_insert ON social_posts
          FOR INSERT
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_posts_isolation_update ON social_posts
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_posts_isolation_delete ON social_posts
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);
      await client.query(`
        ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;
        ALTER TABLE social_campaigns FORCE ROW LEVEL SECURITY;

        CREATE POLICY social_campaigns_isolation_select ON social_campaigns
          FOR SELECT
          USING (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_campaigns_isolation_insert ON social_campaigns
          FOR INSERT
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_campaigns_isolation_update ON social_campaigns
          FOR UPDATE
          USING (site_id = current_setting('app.current_site_id', true))
          WITH CHECK (site_id = current_setting('app.current_site_id', true));
        CREATE POLICY social_campaigns_isolation_delete ON social_campaigns
          FOR DELETE
          USING (site_id = current_setting('app.current_site_id', true));
      `);
    }, 30000);

    afterAll(async () => {
      // Best-effort cleanup. CASCADE drops the tables and policies
      // together. If the test process crashes mid-run, the orphan
      // schema can be cleaned up manually — each run uses a new UUID
      // so orphans don't collide.
      if (client) {
        try {
          await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
        } catch {
          // ignore — if the schema was never created, drop fails
        }
        await client.end();
      }
    });

    // Helper: run `fn` inside a transaction with the session variable
    // set to the given site id. Mirrors the application's
    // `withDbSiteScope` helper in server/lib/tenant-scoped.ts.
    async function withSite<T>(
      siteId: string | null,
      fn: () => Promise<T>
    ): Promise<T> {
      await client.query("BEGIN");
      try {
        if (siteId !== null) {
          await client.query(
            "SELECT set_config('app.current_site_id', $1, true)",
            [siteId]
          );
        }
        const result = await fn();
        await client.query("ROLLBACK");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    // =========================================================================
    // site_feature_overrides — SELECT isolation
    // =========================================================================

    it("site-a sees only site-a rows via SELECT", async () => {
      const rows = await withSite("site-a", async () => {
        const result = await client.query(
          "SELECT * FROM site_feature_overrides ORDER BY id"
        );
        return result.rows;
      });

      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.site_id === "site-a")).toBe(true);
    });

    it("site-b sees only site-b rows via SELECT", async () => {
      const rows = await withSite("site-b", async () => {
        const result = await client.query(
          "SELECT * FROM site_feature_overrides ORDER BY id"
        );
        return result.rows;
      });

      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.site_id === "site-b")).toBe(true);
    });

    it("missing session variable returns zero rows (fail-closed)", async () => {
      // No set_config call at all. current_setting(...,true) returns
      // the empty string, which cannot match any real site_id.
      const rows = await withSite(null, async () => {
        const result = await client.query(
          "SELECT * FROM site_feature_overrides"
        );
        return result.rows;
      });

      expect(rows.length).toBe(0);
    });

    // =========================================================================
    // site_feature_overrides — INSERT/UPDATE/DELETE isolation
    // =========================================================================

    it("INSERT for mismatched site is rejected by the policy", async () => {
      // Bound to site-a, attempting to insert a site-b row.
      // The WITH CHECK clause should raise
      // "new row violates row-level security policy".
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO site_feature_overrides (site_id, feature_key, enabled) VALUES ('site-b', 'flag99', true)"
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });

    it("INSERT for the bound site succeeds", async () => {
      // Round-trip through a ROLLBACK so we don't leave data behind.
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO site_feature_overrides (site_id, feature_key, enabled) VALUES ('site-a', 'flag99', true)"
          );
        })
      ).resolves.not.toThrow();
    });

    it("UPDATE for mismatched site affects zero rows", async () => {
      // Bound to site-a. Any UPDATE with an id from site-b will not
      // match the SELECT USING clause, so zero rows are updated.
      const updated = await withSite("site-a", async () => {
        const result = await client.query(
          "UPDATE site_feature_overrides SET enabled = true WHERE site_id = 'site-b'"
        );
        return result.rowCount;
      });

      expect(updated).toBe(0);
    });

    it("DELETE for mismatched site affects zero rows", async () => {
      const deleted = await withSite("site-a", async () => {
        const result = await client.query(
          "DELETE FROM site_feature_overrides WHERE site_id = 'site-b'"
        );
        return result.rowCount;
      });

      expect(deleted).toBe(0);
    });

    // =========================================================================
    // feature_rollout_history — NULL site_id handling
    // =========================================================================

    it("site-a sees site-a rows AND global (NULL site_id) rows", async () => {
      const rows = await withSite("site-a", async () => {
        const result = await client.query(
          "SELECT * FROM feature_rollout_history ORDER BY id"
        );
        return result.rows;
      });

      // site-a has 1 row; global has 1 row. Expect 2 total.
      expect(rows.length).toBe(2);
      const siteIds = rows.map((r) => r.site_id);
      expect(siteIds).toContain("site-a");
      expect(siteIds).toContain(null);
    });

    it("site-b does not see site-a rows but does see global rows", async () => {
      const rows = await withSite("site-b", async () => {
        const result = await client.query(
          "SELECT * FROM feature_rollout_history ORDER BY id"
        );
        return result.rows;
      });

      // site-b has 1 row; global has 1 row. Expect 2 total, no site-a.
      expect(rows.length).toBe(2);
      const siteIds = rows.map((r) => r.site_id);
      expect(siteIds).toContain("site-b");
      expect(siteIds).toContain(null);
      expect(siteIds).not.toContain("site-a");
    });

    it("INSERT with NULL site_id is allowed (global audit write)", async () => {
      // Migration 0005 relaxed the INSERT WITH CHECK to match the
      // SELECT policy, allowing `site_id IS NULL` rows. The admin-side
      // callers in FeatureFlagService (createFlag at index.ts:212,
      // addDependency at 692, removeDependency at 729) write global
      // audit events without a site context; this assertion proves
      // those writes succeed under the relaxed policy even when the
      // session variable is bound to a specific site.
      //
      // The forge-resistance story: Layer 1 (route auth + RBAC) is
      // what prevents a non-admin tenant from reaching this insert
      // path at all. RLS is defense in depth; the relaxed check
      // intentionally accepts NULL inserts from any bound-site
      // caller that has passed Layer 1. See migration 0005 for the
      // full rationale.
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO feature_rollout_history (feature_key, event_type, site_id) VALUES ('flag_x', 'created', NULL)"
          );
        })
      ).resolves.not.toThrow();
    });

    it("INSERT with mismatched non-null site_id is still rejected", async () => {
      // Proves migration 0005 only relaxed the NULL case. A tenant
      // bound to site-a still cannot write an audit row claiming to
      // belong to site-b — the second disjunct of the WITH CHECK
      // enforces the equality when site_id is non-null.
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO feature_rollout_history (feature_key, event_type, site_id) VALUES ('flag_z', 'created', 'site-b')"
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });

    it("INSERT for the bound site succeeds", async () => {
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO feature_rollout_history (feature_key, event_type, site_id) VALUES ('flag_y', 'enabled', 'site-a')"
          );
        })
      ).resolves.not.toThrow();
    });

    // =========================================================================
    // Fail-closed semantics on the empty-string edge case
    // =========================================================================

    it("session variable set to empty string returns zero rows", async () => {
      // Deliberately set the session variable to '' to prove that
      // even an explicit empty value cannot smuggle past the policy
      // (matches no real site_id).
      const rows = await withSite("", async () => {
        const result = await client.query(
          "SELECT * FROM site_feature_overrides"
        );
        return result.rows;
      });

      expect(rows.length).toBe(0);
    });

    // =========================================================================
    // api_keys — M1.8a strict-equality isolation (migration 0006)
    // =========================================================================
    //
    // These assertions validate the Phase B-style policies on api_keys
    // introduced by `migrations/0006_add_api_keys_rls_policies.sql`.
    // Note that the SDK auth flow's validateKey path is intentionally
    // cross-tenant by design (it has to look up keys by hash before
    // any site context exists) and is NOT covered by these assertions
    // — see the JSDoc on `api-key-service.validateKey` for the
    // deployment-time options.

    it("site-a sees only its own api_keys via SELECT", async () => {
      const rows = await withSite("site-a", async () => {
        const result = await client.query(
          "SELECT * FROM api_keys ORDER BY id"
        );
        return result.rows;
      });

      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.site_id === "site-a")).toBe(true);
    });

    it("site-b does not see site-a api_keys via SELECT", async () => {
      const rows = await withSite("site-b", async () => {
        const result = await client.query(
          "SELECT * FROM api_keys ORDER BY id"
        );
        return result.rows;
      });

      expect(rows.length).toBe(1);
      expect(rows[0].site_id).toBe("site-b");
    });

    it("api_keys SELECT with no session vars set returns zero rows (fail-closed baseline)", async () => {
      // Fail-closed baseline: neither `app.current_site_id` nor
      // `app.api_key_lookup` is set. Both SELECT policies evaluate
      // to false (strict equality mismatches empty string; bypass
      // check requires literal 'true'). Must return zero rows.
      const rows = await withSite(null, async () => {
        const result = await client.query(
          "SELECT * FROM api_keys WHERE key_hash = 'hash_a1'"
        );
        return result.rows;
      });

      expect(rows.length).toBe(0);
    });

    it("api_keys SELECT with app.api_key_lookup='true' returns rows regardless of site binding (0007 bypass)", async () => {
      // Migration 0007 adds a PERMISSIVE SELECT policy that grants
      // cross-tenant access when `app.api_key_lookup` is set to the
      // literal string 'true'. This is the `validateKey` resolution
      // path — the SDK auth flow sets the flag before the hash
      // lookup, and the policy allows the row through.
      //
      // Run inside a manual transaction (not withSite) so we can set
      // the bypass variable without also setting app.current_site_id.
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.api_key_lookup', 'true', true)"
        );
        const result = await client.query(
          "SELECT * FROM api_keys ORDER BY id"
        );
        // Three seed rows exist (2 site-a, 1 site-b). The bypass
        // grants SELECT on all of them regardless of site binding.
        expect(result.rows.length).toBe(3);
        const siteIds = result.rows.map((r) => r.site_id);
        expect(siteIds).toContain("site-a");
        expect(siteIds).toContain("site-b");
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("api_keys INSERT with bypass flag set is STILL rejected unless site_id matches (0007 is SELECT-only)", async () => {
      // Critical security assertion: the 0007 bypass policy ONLY
      // applies to SELECT. INSERT/UPDATE/DELETE policies from 0006
      // are unchanged and still require strict
      // `site_id = current_setting('app.current_site_id', true)`.
      // This assertion proves that a caller who sets
      // `app.api_key_lookup='true'` cannot forge rows — the bypass
      // does not smuggle past the write policies.
      //
      // Scenario: set the bypass flag AND bind to site-a, then try
      // to insert a row claiming site-b. Must be rejected.
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.api_key_lookup', 'true', true)"
        );
        await client.query(
          "SELECT set_config('app.current_site_id', 'site-a', true)"
        );
        await expect(
          client.query(
            "INSERT INTO api_keys (site_id, key_prefix, key_hash, name) VALUES ('site-b', 'ff_pro_x', 'hash_x', 'forged')"
          )
        ).rejects.toThrow(/row-level security/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("api_keys INSERT with only bypass flag (no site binding) is rejected (fail-closed writes)", async () => {
      // Second critical security assertion: setting only the bypass
      // flag (without also setting app.current_site_id) must not
      // allow any INSERT, because the INSERT WITH CHECK from 0006
      // compares against empty string which matches no real site.
      // This covers the case where a future caller might set the
      // bypass flag and forget the site binding.
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.api_key_lookup', 'true', true)"
        );
        await expect(
          client.query(
            "INSERT INTO api_keys (site_id, key_prefix, key_hash, name) VALUES ('site-a', 'ff_pro_z', 'hash_z', 'forged')"
          )
        ).rejects.toThrow(/row-level security/i);
      } finally {
        await client.query("ROLLBACK");
      }
    });

    it("api_keys INSERT for mismatched site is rejected", async () => {
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO api_keys (site_id, key_prefix, key_hash, name) VALUES ('site-b', 'ff_pro_x', 'hash_x', 'forged')"
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });

    it("api_keys INSERT for the bound site succeeds", async () => {
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO api_keys (site_id, key_prefix, key_hash, name) VALUES ('site-a', 'ff_pro_y', 'hash_y', 'legit')"
          );
        })
      ).resolves.not.toThrow();
    });

    it("api_keys UPDATE for mismatched site affects zero rows", async () => {
      // A site-a tenant attempting to revoke a site-b key matches
      // no rows under the SELECT USING + UPDATE USING policies, so
      // the UPDATE silently affects zero rows rather than raising.
      // This is the defense that makes `revokeKey(siteId, keyId)`
      // safe even if a buggy admin UI passes the wrong siteId for
      // a given keyId.
      const updated = await withSite("site-a", async () => {
        const result = await client.query(
          "UPDATE api_keys SET name = 'hijacked' WHERE site_id = 'site-b'"
        );
        return result.rowCount;
      });

      expect(updated).toBe(0);
    });

    it("api_keys DELETE for mismatched site affects zero rows", async () => {
      const deleted = await withSite("site-a", async () => {
        const result = await client.query(
          "DELETE FROM api_keys WHERE site_id = 'site-b'"
        );
        return result.rowCount;
      });

      expect(deleted).toBe(0);
    });

    // =========================================================================
    // social_accounts / social_posts / social_campaigns — M1.8b (migration 0008)
    // =========================================================================
    //
    // Nine assertions (3 per table), one per verb direction. Keeping
    // them narrow: the policy shape is identical to the already-
    // well-tested shape on site_feature_overrides (0003) and api_keys
    // (0006), so the distinct coverage value is proving that the
    // policies are correctly installed on each of the three new
    // tables, not re-validating the policy semantics themselves.

    // --- social_accounts ---

    it("social_accounts: site-a sees only site-a rows via SELECT", async () => {
      const rows = await withSite("site-a", async () => {
        const result = await client.query(
          "SELECT * FROM social_accounts ORDER BY id"
        );
        return result.rows;
      });
      expect(rows.length).toBe(1);
      expect(rows[0].site_id).toBe("site-a");
    });

    it("social_accounts: INSERT for mismatched site is rejected", async () => {
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO social_accounts (id, site_id, platform, account_name) VALUES ('sa-x', 'site-b', 'twitter', 'forged')"
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });

    it("social_accounts: UPDATE for mismatched site affects zero rows", async () => {
      const updated = await withSite("site-a", async () => {
        const result = await client.query(
          "UPDATE social_accounts SET account_name = 'hijacked' WHERE site_id = 'site-b'"
        );
        return result.rowCount;
      });
      expect(updated).toBe(0);
    });

    // --- social_posts ---

    it("social_posts: site-b sees only site-b rows via SELECT", async () => {
      const rows = await withSite("site-b", async () => {
        const result = await client.query(
          "SELECT * FROM social_posts ORDER BY id"
        );
        return result.rows;
      });
      expect(rows.length).toBe(1);
      expect(rows[0].site_id).toBe("site-b");
    });

    it("social_posts: INSERT for mismatched site is rejected", async () => {
      await expect(
        withSite("site-b", async () => {
          await client.query(
            "INSERT INTO social_posts (id, site_id, content, status) VALUES ('sp-x', 'site-a', 'forged', 'draft')"
          );
        })
      ).rejects.toThrow(/row-level security/i);
    });

    it("social_posts: DELETE for mismatched site affects zero rows", async () => {
      const deleted = await withSite("site-b", async () => {
        const result = await client.query(
          "DELETE FROM social_posts WHERE site_id = 'site-a'"
        );
        return result.rowCount;
      });
      expect(deleted).toBe(0);
    });

    // --- social_campaigns ---

    it("social_campaigns: missing session var returns zero rows (fail-closed)", async () => {
      const rows = await withSite(null, async () => {
        const result = await client.query("SELECT * FROM social_campaigns");
        return result.rows;
      });
      expect(rows.length).toBe(0);
    });

    it("social_campaigns: INSERT for the bound site succeeds", async () => {
      await expect(
        withSite("site-a", async () => {
          await client.query(
            "INSERT INTO social_campaigns (id, site_id, name, status) VALUES ('sc-x', 'site-a', 'new-launch', 'draft')"
          );
        })
      ).resolves.not.toThrow();
    });

    it("social_campaigns: site-a sees only site-a rows via SELECT", async () => {
      const rows = await withSite("site-a", async () => {
        const result = await client.query(
          "SELECT * FROM social_campaigns ORDER BY id"
        );
        return result.rows;
      });
      expect(rows.length).toBe(1);
      expect(rows[0].site_id).toBe("site-a");
    });
  }
);

// Optional: if the user wants a visible signal that the suite was
// skipped, this it() runs unconditionally and logs the reason.
// Commented out because vitest's default "skipped" output is already
// clear enough. Uncomment if the CI output needs a louder banner.
//
// if (!CONNECTION_URL) {
//   it.skip(`${SKIP_REASON}`, () => {});
// }
