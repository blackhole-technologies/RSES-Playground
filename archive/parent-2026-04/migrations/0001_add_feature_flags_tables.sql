-- Add feature flags tables
-- Migration: 0001_add_feature_flags_tables

CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"globally_enabled" boolean DEFAULT true NOT NULL,
	"toggleable" boolean DEFAULT true NOT NULL,
	"default_state" boolean DEFAULT false NOT NULL,
	"percentage_rollout" jsonb,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"owner" text,
	"sunset_date" text,
	"targeting_rules" jsonb DEFAULT '[]'::jsonb,
	"change_history" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_modified_by" text
);

CREATE TABLE IF NOT EXISTS "site_feature_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" text
);

CREATE TABLE IF NOT EXISTS "user_feature_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"created_by" text
);

CREATE TABLE IF NOT EXISTS "feature_usage_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_key" text NOT NULL,
	"period" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"evaluations" integer DEFAULT 0 NOT NULL,
	"enabled_evaluations" integer DEFAULT 0 NOT NULL,
	"disabled_evaluations" integer DEFAULT 0 NOT NULL,
	"unique_users" integer DEFAULT 0 NOT NULL,
	"evaluation_errors" integer DEFAULT 0 NOT NULL,
	"avg_evaluation_time_ms" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "feature_rollout_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature_key" text NOT NULL,
	"event_type" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"site_id" text,
	"user_id" text,
	"performed_by" text,
	"reason" text,
	"timestamp" timestamp DEFAULT now()
);

-- Add foreign keys (only if tables exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'feature_rollout_history_feature_key_feature_flags_key_fk'
    ) THEN
        ALTER TABLE "feature_rollout_history"
        ADD CONSTRAINT "feature_rollout_history_feature_key_feature_flags_key_fk"
        FOREIGN KEY ("feature_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'feature_usage_stats_feature_key_feature_flags_key_fk'
    ) THEN
        ALTER TABLE "feature_usage_stats"
        ADD CONSTRAINT "feature_usage_stats_feature_key_feature_flags_key_fk"
        FOREIGN KEY ("feature_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'site_feature_overrides_feature_key_feature_flags_key_fk'
    ) THEN
        ALTER TABLE "site_feature_overrides"
        ADD CONSTRAINT "site_feature_overrides_feature_key_feature_flags_key_fk"
        FOREIGN KEY ("feature_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_feature_overrides_feature_key_feature_flags_key_fk'
    ) THEN
        ALTER TABLE "user_feature_overrides"
        ADD CONSTRAINT "user_feature_overrides_feature_key_feature_flags_key_fk"
        FOREIGN KEY ("feature_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade;
    END IF;
END $$;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_site_feature_overrides_site_id" ON "site_feature_overrides" ("site_id");
CREATE INDEX IF NOT EXISTS "idx_site_feature_overrides_feature_key" ON "site_feature_overrides" ("feature_key");
CREATE INDEX IF NOT EXISTS "idx_user_feature_overrides_user_id" ON "user_feature_overrides" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_feature_overrides_feature_key" ON "user_feature_overrides" ("feature_key");
CREATE INDEX IF NOT EXISTS "idx_feature_usage_stats_feature_key" ON "feature_usage_stats" ("feature_key");
CREATE INDEX IF NOT EXISTS "idx_feature_usage_stats_period" ON "feature_usage_stats" ("period", "period_start");
CREATE INDEX IF NOT EXISTS "idx_feature_rollout_history_feature_key" ON "feature_rollout_history" ("feature_key");
CREATE INDEX IF NOT EXISTS "idx_feature_rollout_history_timestamp" ON "feature_rollout_history" ("timestamp" DESC);
