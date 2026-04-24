# Latest STATUS

The current authoritative status document is:

→ [`STATUS_2026-04-17_v11.md`](./STATUS_2026-04-17_v11.md)

---

## Versioning convention

- Status documents are immutable once published.
- New revisions get a new file: `STATUS_YYYY-MM-DD_vN.md`.
- This pointer file (`STATUS-LATEST.md`) is the only file that mutates — it always points to the most recent version.
- See [`ROADMAP-LATEST.md`](./ROADMAP-LATEST.md) for the companion roadmap pointer.

## History

| Date | Version | File | Notes |
|---|---|---|---|
| 2026-04-14 (am) | v1 | [`STATUS_2026-04-14_v1.md`](./STATUS_2026-04-14_v1.md) | Initial authoritative status. Supersedes README self-grade, REVIEW.md, and PHASE-ALIGNMENT.md. |
| 2026-04-14 (pm) | v2 | [`STATUS_2026-04-14_v2.md`](./STATUS_2026-04-14_v2.md) | Records ROADMAP M1 progress: per-module timeouts, fail-closed RBAC markers, AsyncLocalStorage tenant scope + lint test, optional Redis rate limiter. 309 → 347 security tests. Composite 6.5 → 7.0. |
| 2026-04-14 (eve) | v3 | [`STATUS_2026-04-14_v3.md`](./STATUS_2026-04-14_v3.md) | Anthropic deferred per user instruction. TS error baseline cut 691 → 175 (-75%). First route migrated to RBAC markers. Marker coverage lint added. Security tests now a CI gate. 347 → 351 security tests. Composite 7.0 → 7.5. |
| 2026-04-14 (late eve) | v4 | [`STATUS_2026-04-14_v4.md`](./STATUS_2026-04-14_v4.md) | TS baseline 175 → 0 (-100%). CI typecheck job is now a hard gate. 351 security tests still passing. Composite 7.5 → 8.0. |
| 2026-04-14 (overnight) | v5 | [`STATUS_2026-04-14_v5.md`](./STATUS_2026-04-14_v5.md) | M1.7 route marker migration complete. 12 route files migrated, 172 handlers wrapped. Security tests 351 → 387. Marker lint covers 13 files. 0 TS errors intact. Composite 8.0 → 8.3. |
| 2026-04-15 (am) | v6 | [`STATUS_2026-04-14_v6.md`](./STATUS_2026-04-14_v6.md) | M1.4 Phase A/B/C shipped. Transaction-scoped `set_config` in `tenant-scoped.ts`, `0003_add_tenant_rls_policies.sql`, 12-assertion `tests/rls/rls-isolation.test.ts`, `npm run test:rls` script. Phase D (`0004_force_tenant_rls_policies.sql`) staged but not applied. Fast suite still 387/387. Composite 8.3 → 8.6. |
| 2026-04-15 (pm) | v7 | [`STATUS_2026-04-15_v7.md`](./STATUS_2026-04-15_v7.md) | Phase D readiness pass. Bypass audit of `server/` found all 12 raw-`db` calls clustered in `pg-storage.ts`: 7 per-site sites converted to `scoped()`/`withDbSiteScope()`; 5 intentional cross-tenant sites explicitly commented. `withDbSiteScope` exported as a public escape hatch. Migration 0005 staged (not applied) — relaxes `feature_rollout_history` INSERT WITH CHECK to allow `site_id IS NULL` so admin-side global audit writes survive Phase D. RLS test updated to 13 assertions in lockstep. 387/387 fast suite intact, 0 TS errors. Composite unchanged at 8.6 (gated on user applying 0005 + 0004). |
| 2026-04-15 (eve) | v8 | [`STATUS_2026-04-15_v8.md`](./STATUS_2026-04-15_v8.md) | M1.3 shipped — `server/lib/dev-query-guard.ts` Proxy wraps exported `db` in development only, blocking raw `db.select/insert/update/delete` on registered multi-tenant tables with a loud error pointing at `scoped()` / `withDbSiteScope()`. Registry helpers extracted to db-free `server/lib/tenant-scoped-tables.ts` so guard unit tests can import without `DATABASE_URL`. Fast suite 387 → 400 (13 new guard assertions). Full `site_id` grep across `shared/` surfaces ~15 unregistered multi-tenant tables — M1.8 scope revised from 0.5 day to 1–3 days in ROADMAP v7. Composite 8.6 → 8.7. |
| 2026-04-15 (night) | v9 | [`STATUS_2026-04-15_v9.md`](./STATUS_2026-04-15_v9.md) | M1.8a shipped — `apiKeys` registered in `tenant-scoped-registry.ts` (3 tables total); 7 call sites in `server/services/api-keys/api-key-service.ts` converted to `scoped()` / `withDbSiteScope()` with 3 signature changes (`revokeKey`, `getKey`, `updateLastUsed` all now take `siteId`); migration 0006 staged with 4 strict-equality policies on `api_keys` and a multi-paragraph banner documenting the **validateKey cross-tenant problem** with three deployment options (superuser / bypass policy / key format). RLS integration test extended with 7 new assertions (13 → 20). Full suite 400/400 passing, 0 TS errors. M1.8 playbook proven on the smallest table. Composite 8.7 → 8.75. |
| 2026-04-15 (night+) | v10 | [`STATUS_2026-04-15_v10.md`](./STATUS_2026-04-15_v10.md) | validateKey option (b) implemented. Private `withApiKeyLookupScope` helper colocated in `api-key-service.ts` opens a Drizzle tx and sets `app.api_key_lookup='true'` via set_config; `validateKey` rewritten to run the hash lookup inside the helper. Migration 0007 staged with a single additive PERMISSIVE SELECT policy on `api_keys` reading the bypass flag. 3 new RLS assertions prove the bypass is SELECT-only and fail-closed on writes (20 → 23). Full suite 400/400 passing, 0 TS errors. Apply chain now runnable end-to-end: 0005 → 0006 → 0007 → 0004. Composite 8.75 → 8.8. |
| 2026-04-17 | v11 | [`STATUS_2026-04-17_v11.md`](./STATUS_2026-04-17_v11.md) | Ledger reconciliation — seven commits on 2026-04-16 captured. M1.8b (social-media registration + migration 0008 + 9 RLS assertions) + M1.8b-follow (by-id service-layer threading) + M1.8c (multisite, migration 0009) + M1.8d (rbac NULLABLE, disjunctive migration 0010) + M1.7-seed (14 RBAC permissions for incidents/watcher/automation/projects) + M1.7-CI (v8 coverage job, 30/25/25 floor, HTML artifact) + service-layer `withDbSiteScope` rollout in rbac/audit/domain. Registered tables 3 → 12. Staged migrations 0004/0005/0006/0007 → 0004–0010. RLS assertions 23 → 45. 0 TS errors, 400/400 fast suite intact. Apply chain still gated on DBA. Composite 8.8 → 9.15. |
