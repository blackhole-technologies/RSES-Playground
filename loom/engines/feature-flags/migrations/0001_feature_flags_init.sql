-- Feature flags schema: feature_flags + feature_rollout_history.
--
-- Backs vendor/02-feature-flags's IFeatureFlagStorage and
-- IRolloutHistoryStorage interfaces. SPEC §4.7 names two tables; this
-- migration adopts that shape with four additions to make vendor/02's
-- FeatureFlag type round-trip without lossy field reconstruction:
-- toggleable, tags, owner, sunset_date. Without those, "core" flags
-- marked toggleable=false would be silently UI-disable-able.
--
-- Ordering: this file's name ('feature_flags' starts with 'f') sorts
-- AFTER 'auth_init' and 'core_init' lexicographically, so users(id)
-- exists by the time feature_rollout_history's FK references it.
--
-- Migration runner sees this via bin/migrate.ts's `engines/*/migrations`
-- glob and the matching update to bin/reset-db.ts.

CREATE TABLE feature_flags (
    key                 TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    description         TEXT,
    -- Free-form category; vendor/02 uses 'core' / 'optional' / 'beta'
    -- / 'experimental' / 'deprecated', but SPEC defaults to 'general'
    -- and admin tooling can introduce more.
    category            TEXT NOT NULL DEFAULT 'general',
    globally_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    -- toggleable=false means admin UI must NOT offer to disable this
    -- flag. Used for core dependencies (auth, db) that can't be
    -- meaningfully turned off.
    toggleable          BOOLEAN NOT NULL DEFAULT TRUE,
    -- default_state is what the evaluator returns when a user is NOT
    -- in any rollout/targeting bucket. globally_enabled is the
    -- gatekeeper above that.
    default_state       BOOLEAN NOT NULL DEFAULT FALSE,
    -- JSONB blobs: vendor/02's evaluator parses these. Keeping them
    -- as JSONB rather than expanded columns lets the rollout/targeting
    -- shape evolve without migrations every time vendor/02 changes.
    percentage_rollout  JSONB,
    targeting_rules     JSONB,
    dependencies        JSONB,
    tags                JSONB NOT NULL DEFAULT '[]'::jsonb,
    owner               TEXT,
    sunset_date         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE feature_rollout_history (
    id              BIGSERIAL PRIMARY KEY,
    flag_key        TEXT NOT NULL REFERENCES feature_flags(key)
                        ON DELETE CASCADE,
    -- 'enabled' / 'disabled' / 'rollout_changed' per SPEC §4.7;
    -- intentionally not constrained at the DB layer so future event
    -- types (e.g. 'targeting_updated') can land without a migration.
    event_type      TEXT NOT NULL,
    previous_value  JSONB,
    new_value       JSONB,
    -- SET NULL (not CASCADE) so deleting the actor user does not erase
    -- the flag's audit trail. Same precedent as
    -- invite_codes.consumed_by from Phase 1.
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    reason          TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per SPEC §4.7. Supports the common admin query "show recent rollout
-- events for flag X" without scanning the whole table.
CREATE INDEX feature_rollout_history_flag_key_timestamp_idx
    ON feature_rollout_history (flag_key, timestamp DESC);
