-- Auth module initial schema: users, sessions, invite_codes per SPEC §4.1.
--
-- Ordering note: the migration runner sorts globally by filename, not
-- by directory. `0001_auth_init.sql` sorts alphabetically before
-- `0001_core_init.sql` ('a' < 'c'), so auth actually runs FIRST. This is
-- acceptable today because auth has no FK dependencies on core tables
-- (system_settings, _migrations). Any future migration that references
-- both must use a later numeric prefix (e.g. `0002_*`) to force the
-- correct apply order.
--
-- UUIDs come from PostgreSQL's built-in `gen_random_uuid()`, which has
-- been in core since PG 13. No `pgcrypto` or `uuid-ossp` extension is
-- needed. The docker-compose image (`postgres:16-alpine`) has it.

CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username          TEXT NOT NULL,
    email             TEXT,
    password_hash     TEXT NOT NULL,
    display_name      TEXT,
    is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
    profile_public    BOOLEAN NOT NULL DEFAULT FALSE,
    invite_code_used  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at     TIMESTAMPTZ,
    disabled          BOOLEAN NOT NULL DEFAULT FALSE
);

-- Case-insensitive username uniqueness.
--
-- SPEC §5.2: "unique, case-insensitive matching but stored as-entered".
-- The `username` column is plain TEXT so the original casing is preserved
-- on storage; the functional index below folds case at index time so that
-- "Alice" and "alice" collide as duplicates.
--
-- Queries MUST lowercase their input to benefit from the index AND to
-- enforce the case-insensitive contract at read time. A plain
-- `WHERE username = $1` would skip the index and silently allow
-- case-sensitive lookups — a contract bug waiting to happen. Canonical:
--
--     WHERE lower(username) = lower($1)
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

-- Email is optional per SPEC §4.1. A partial unique index enforces
-- uniqueness only on non-null rows, so multiple users can register
-- without an email without colliding on a shared NULL. Case-folded the
-- same way usernames are. Canonical lookup:
--
--     WHERE lower(email) = lower($1)
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email))
    WHERE email IS NOT NULL;

CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cookie          TEXT NOT NULL UNIQUE,
    -- Absolute expiry: caller sets `created_at + 90 days` on insert.
    -- Sliding expiry (30-day inactivity) is enforced at read time by
    -- comparing NOW() to last_active_at.
    expires_at      TIMESTAMPTZ NOT NULL,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip              TEXT,
    user_agent      TEXT
);

-- Per SPEC §4.1 indexes. `sessions_user_id_idx` supports per-user
-- enumeration (admin "my active sessions" view, bulk logout).
-- `sessions_expires_at_idx` supports the background cleanup job's range
-- scan for expired rows.
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE invite_codes (
    code          TEXT PRIMARY KEY,
    created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ,
    -- SET NULL (not CASCADE) preserves the invite_codes row for audit
    -- even after the consumer user is deleted — the code stays
    -- uniquely-consumed so admins cannot accidentally reissue it. See
    -- SPEC §4.1 and the commit message that introduced this table.
    consumed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    consumed_at   TIMESTAMPTZ
);
