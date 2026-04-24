# 13-password-hash

Three password-hashing primitives, extracted from the parent repo's auth glue: `hashPassword`, `verifyPassword`, and `toSafeUser`. scrypt-based, constant-time verification, no framework dependencies.

## Why this scope (and not "all of auth")

The parent repo has four auth files totalling ~800 lines: passport configuration, Express session setup (MemoryStore/Redis), login/register/logout/me routes, and password-complexity validation. All of them are opinionated about specifics that rarely port cleanly:

- `passport.ts` assumes a Drizzle ORM + a specific `users` table schema (id/username/passwordHash/email/displayName/isAdmin/…) + passport.js.
- `session.ts` wires express-session with MemoryStore or Redis and a specific cookie policy.
- `routes.ts` defines login/register/logout/me handlers coupled to the passport setup and the user schema.
- `password-validation.ts` is 147 lines of zod schemas duplicating logic that `zxcvbn` does better.

What *does* port cleanly is the **scrypt-based password hashing primitive** — the scrypt-with-random-salt implementation, the `salt:hash` storage format, and the constant-time comparison. That's what's here.

If you need passport/session/routes, write them against your own user table — they're short, they're framework-specific, and the only piece that benefits from copy-paste is the hash function.

## What's here

`src/password-hash.ts` — ~50 lines.

Exports:
- **`hashPassword(password: string): Promise<string>`** — hashes using scrypt with a fresh 16-byte random salt and 64-byte derived key. Returns `"<salt-hex>:<hash-hex>"`.
- **`verifyPassword(password: string, storedHash: string): Promise<boolean>`** — splits the stored format, recomputes the derived key, compares using `timingSafeEqual` (constant-time, no early-exit on mismatched first byte).
- **`toSafeUser<T extends { passwordHash: unknown }>(user: T): Omit<T, "passwordHash">`** — drops the `passwordHash` field from a user object so you don't accidentally send it in an API response. Generic in the input type — works with any user shape that has a `passwordHash` field.

## Storage format

`hashPassword` returns `"<salt>:<hash>"` where both sides are lowercase hex. 16 random bytes of salt → 32 hex chars; 64 bytes of derived key → 128 hex chars. Total ~161 chars. Store as a plain text column.

`verifyPassword` rejects any input that doesn't split into exactly two non-empty parts on `:`.

## Parameters

scrypt is called with the default N / r / p (`N=16384, r=8, p=1` via Node's default — these are sensible defaults from the Node crypto module). If your threat model needs larger parameters, pass the third argument of `scrypt(password, salt, keylen)` isn't the place — you'd need to switch to `scrypt(password, salt, keylen, options)` and add `N`, `r`, `p` fields. For most authentication workloads, the defaults are fine.

## Dependencies

Runtime: Node built-in `crypto` and `util`. No npm packages.

Tests: `vitest` (dev-dep).

## Running tests

```bash
npx vitest run tests/
```

Test file covers:
- Same password hashes to different outputs (salt is fresh each call)
- Verifying a correct password returns true
- Verifying a wrong password returns false
- Verifying against a malformed hash (missing colon, empty parts) returns false
- `toSafeUser` drops `passwordHash` and preserves all other fields
- Timing-safety smoke test (comparison runs even for wrong-length inputs)

## Usage

```ts
import { hashPassword, verifyPassword, toSafeUser } from "./password-hash";

// Registration:
const passwordHash = await hashPassword(formPassword);
await db.insert(users).values({ username, passwordHash, email }).returning();

// Login:
const user = await db.select().from(users).where(eq(users.username, formUsername)).limit(1);
if (!user[0]) return null;
const ok = await verifyPassword(formPassword, user[0].passwordHash);
if (!ok) return null;
return toSafeUser(user[0]);

// Response:
res.json({ user: toSafeUser(user) });  // no passwordHash leaks
```

## What this is not

- **Not a full auth system.** It's the hash primitive. You still need: session cookies, CSRF protection (see `04-security-middleware`), user lookup, login routes, password-complexity validation.
- **Not argon2 / bcrypt.** scrypt is fine, but if your stack standardizes on argon2id (the OWASP recommendation as of writing), use that instead — replace the two function bodies with calls to `@node-rs/argon2` or the `argon2` npm package, keep the storage format.
- **Not a replacement for a battle-tested library.** If you're building something that holds millions of accounts, use `passport-local` + `@node-rs/argon2` + a real framework. If you're building a CMS for yourself or a small team, this is plenty.

## Provenance

The functions were copied verbatim from `server/auth/passport.ts` (lines 28–61 of the parent repo). The existing test file in `tests/security/auth.test.ts` already had a standalone inline implementation that was byte-for-byte identical to those functions, which is what I extracted here and pointed at the salvaged source.

The test file also had tests for "session" security (`cookie.httpOnly`, `cookie.secure`, etc.) that weren't actually testing anything — they tested object-literal shapes. Those are dropped from the salvage test file.

## Header comment

Source retains the original `@author SEC (Security Specialist Agent)`. Cosmetic; strip at will.
