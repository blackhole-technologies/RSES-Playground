-- Core init migration.
-- Creates the system_settings singleton row and the _migrations
-- tracking table bootstrap (_migrations is also created idempotently
-- by the runner before this migration applies).

-- System-wide configuration. One row ever; key = 'default'.
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  registration_mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (registration_mode IN ('disabled', 'invite', 'open')),
  bootstrap_token_hash TEXT,
  bootstrap_token_consumed_at TIMESTAMPTZ,
  default_rate_limit_per_min INT NOT NULL DEFAULT 60,
  retention_classification_log_days INT NOT NULL DEFAULT 30,
  retention_soft_deleted_days INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key) VALUES ('default');
