# Tenant Isolation — Developer Guide

**Last updated:** 2026-04-14
**Status:** Defense layer 2 of 3 active. Layer 3 (Postgres RLS) tracked in ROADMAP M1.4.

---

## The three layers

Tenant isolation in RSES-Playground is enforced at three distinct layers. Each layer alone is
insufficient. All three together are defense-in-depth.

| Layer | What it does | File | Status |
|---|---|---|---|
| 1. Request | Site context middleware extracts the site id from the request, blocks explicit cross-site URL params | `server/middleware/tenant-isolation.ts` | ✅ Active |
| 2. Query | `scoped(siteId)` helper requires explicit site_id binding on every query against tagged tables | `server/lib/tenant-scoped.ts` | ✅ Active (2026-04-14) |
| 3. Database | Postgres row-level security policies enforce site_id on every row read/write | n/a yet | ⏳ Tracked in ROADMAP M1.4 |

The historical security gap was that **only Layer 1 existed**. A developer could write a Drizzle
query against a multi-tenant table without a `where(siteId = ...)` clause and it would silently
return rows from every site. This document explains how to use Layer 2 to prevent that.

---

## Using `scoped(siteId)`

Every code path that reads or writes a multi-tenant table **must** go through the helper:

```ts
import { scoped } from "@/server/lib/tenant-scoped";
import { siteFeatureOverrides } from "@shared/schema";

// READ all rows for the current site
const overrides = await scoped(siteId).select(siteFeatureOverrides);

// READ one row by id, scoped to site
const override = await scoped(siteId).selectOne(siteFeatureOverrides, { id: 42 });

// INSERT — siteId is auto-injected, do not pass it
await scoped(siteId).insert(siteFeatureOverrides, {
  featureKey: "new-editor",
  enabled: true,
});

// UPDATE — set cannot include siteId
await scoped(siteId).update(siteFeatureOverrides, { id: 42 }, { enabled: false });

// DELETE
await scoped(siteId).deleteWhere(siteFeatureOverrides, { id: 42 });
```

### Where does `siteId` come from?

In a request handler, read it from the site context that was attached by the middleware:

```ts
import { tryGetSiteContext } from "@/server/multisite/site/site-context";

app.get("/api/feature-overrides", async (req, res) => {
  const ctx = tryGetSiteContext();
  if (!ctx) return res.status(400).json({ error: "no site context" });

  const rows = await scoped(ctx.siteId).select(siteFeatureOverrides);
  res.json(rows);
});
```

In a background job or queue worker, you must pass the siteId explicitly when scheduling the
job. Do **not** rely on AsyncLocalStorage — it does not propagate across process boundaries.

---

## Why explicit siteId binding (vs. implicit AsyncLocalStorage)

The helper deliberately requires `scoped(siteId)` to be called with an argument rather than
reading the current site from AsyncLocalStorage. Three reasons:

1. **Background jobs.** Queue workers and scheduled tasks run outside any request, so AsyncLocalStorage
   returns nothing. An implicit-context API would fail open in those contexts.
2. **Cross-tenant work.** Some admin tools legitimately need to operate on multiple sites
   (e.g. a cross-site replication job). Explicit binding makes the multi-site loop visible.
3. **Reviewability.** A reviewer can grep for `scoped(` and see exactly which site each query
   targets. With an implicit context, the binding is invisible and bugs hide easily.

---

## Registering a new multi-tenant table

1. Add the column to `shared/schema.ts` (or whichever schema file owns the table):
   ```ts
   siteId: text("site_id").notNull(),
   ```
2. Add the table to `server/lib/tenant-scoped-registry.ts`:
   ```ts
   registerMultiTenantTable(myTable, myTable.siteId);
   ```
3. Add a security test asserting the binding is enforced:
   ```ts
   // tests/security/tenant-scoped.test.ts
   it("rejects unscoped queries on myTable", async () => {
     await expect(
       db.select().from(myTable) /* unscoped! */
     ).resolves.toBeDefined(); // this currently still works — Layer 3 will block it
   });
   ```
4. Add a write a test that proves cross-tenant reads are blocked:
   ```ts
   it("scoped() does not leak across sites", async () => {
     await scoped("site-a").insert(myTable, { ... });
     const rows = await scoped("site-b").select(myTable);
     expect(rows).toHaveLength(0);
   });
   ```
5. Update `docs/STATUS-LATEST.md` to note the new enforced table.

---

## What this helper does NOT protect against

- **Direct unscoped queries.** A developer who imports `db` directly and writes
  `db.select().from(siteFeatureOverrides)` is not protected by this helper. Code review and the
  upcoming Drizzle pre-query hook (M1.3) catch this. Postgres RLS (M1.4) is the long-term fix.
- **Bugs in the site context middleware.** If the middleware attaches the wrong site id to the
  request, the helper enforces the wrong binding. The middleware itself has tests, but the
  helper is downstream of it.
- **Admin tools that legitimately span sites.** These bypass the helper by design and should
  be reviewed individually. Document in the call site why cross-site access is needed.

---

## Audit checklist

When reviewing a PR that touches a multi-tenant table:

- [ ] Does every read go through `scoped(siteId)`? Grep for the table name in `db.select` and `db.query`.
- [ ] Does every write go through `scoped(siteId).insert/update/deleteWhere`?
- [ ] If the PR introduces a new table with a `site_id` column, is it registered in
      `tenant-scoped-registry.ts`?
- [ ] Are there tests asserting cross-tenant isolation?
- [ ] Does the PR update STATUS if it changes the set of enforced tables?

---

*Tenant isolation is the kind of bug that doesn't surface in tests and burns trust the moment it
ships. Treat the helper as load-bearing.*
