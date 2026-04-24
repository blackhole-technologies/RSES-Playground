# salvage/

This directory is a collection of the code from the rest of this repo that is actually usable.

The rest of the repo grew around ambitions that never shipped. This directory is the subset that runs, is tested, does a specific thing, and would survive being lifted out on its own.

Each subdirectory is one salvaged unit. They are numbered in the order they were added. Numbering is chronological, not priority — later numbers are not "less important."

## What's in here and what isn't

Code in here:
- has a clear purpose stated in its README
- comes from working, tested code in the parent repo
- is copied, not moved — the parent repo still has its own copies until someone decides to delete them
- was brought over verbatim unless the README says otherwise

Code is NOT in here if:
- it's a facade that claims to integrate with services it doesn't actually call (the "neural classifier", "vector database", "embedding providers", "quantum" files)
- it's architecture that exists on paper but not in runtime (edge workers, Terraform modules, Kubernetes operators, cross-site sync)
- it depends on substrate that isn't provisioned (the multi-tenant tables whose `CREATE TABLE` migrations never existed)
- I can't tell whether it works without running each path, and nobody is running it right now

## Verbatim, except for a few documented edits

Each source file was copied as-is. The only change applied during salvage for most units is to import paths: `@shared/schema` or `../../server/lib/...` imports are rewritten to refer to files inside this salvage subtree so each unit is self-contained. Any further cleanup — stripping the agent-theater doc headers (`@author SGT (Set-Graph Theorist Agent)` etc.), removing `@phase X` references, tightening JSDoc — is a separate pass that hasn't been done.

**Exceptions** — where salvage deviates from verbatim:

- Several units replace the parent repo's `createModuleLogger` import with a local `logger-stub.ts` (minimal console-backed implementation). This is a new file per unit, not a modified copy. Affected units: `02-feature-flags`, `06-circuit-breaker`, `08-queue`, `09-safe-expression`.
- In test files that use `vi.mock("../../server/logger", ...)` to silence the logger, the mock target was rewritten to point at the local `logger-stub.ts`. Affected: `06-circuit-breaker`, `08-queue`.
- `12-tenant-scope-context/tests/tenant-scope-context.test.ts` was written fresh, not copied. The parent repo's test cases for these functions were embedded inside a 248-line test file covering unrelated lint behavior; 3 cases were extracted verbatim and 4 more were added for coverage.
- `13-password-hash` is narrower than its parent: `server/auth/passport.ts` is 181 lines of scrypt + passport + Drizzle user lookup + session integration; the salvage extracts only the 3 framework-agnostic primitives (`hashPassword`, `verifyPassword`, `toSafeUser`) into ~50 lines. `verifyPassword` gained an explicit length guard before `timingSafeEqual` to preserve the "returns false on malformed input" contract. `toSafeUser` is generic in the input type. Test file is fresh — 14 cases ported from the parent repo's `auth.test.ts` + 2 new cases.

## How to use it

Each subdirectory has its own README with its own dependency, test, and usage notes. Read those.

If you want to keep only one unit, delete the others. If you want to keep all of them, the whole directory is self-contained and does not import from the parent repo.

**One exception**: `11-taxonomy-query-engine` imports from `10-taxonomy-algebra` via a relative path (`../../10-taxonomy-algebra/src/...`). Every other unit stands alone. If you take `11` you must also take `10` — the README in `11` explains why (duplicating the 945-line algebra file would be worse than a clearly-declared peer dependency).
