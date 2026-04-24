-- Add sites table for multi-site management
-- Migration: 0002_add_sites_table

CREATE TABLE IF NOT EXISTS "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"environment" text NOT NULL,
	"region" text NOT NULL,
	"version" text NOT NULL,
	"health_status" text DEFAULT 'unknown' NOT NULL,
	"last_health_check" timestamp DEFAULT now(),
	"uptime" integer DEFAULT 0 NOT NULL,
	"resource_usage" jsonb,
	"enabled_features" jsonb DEFAULT '[]'::jsonb,
	"feature_overrides" jsonb DEFAULT '{}'::jsonb,
	"rses_config_id" integer,
	"rses_config_version" integer,
	"owner" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_deployed_at" timestamp
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_sites_environment" ON "sites" ("environment");
CREATE INDEX IF NOT EXISTS "idx_sites_health_status" ON "sites" ("health_status");
CREATE INDEX IF NOT EXISTS "idx_sites_region" ON "sites" ("region");

-- Insert default demo sites
INSERT INTO "sites" ("id", "name", "domain", "environment", "region", "version", "health_status", "uptime", "resource_usage", "enabled_features", "tags", "created_at")
VALUES
  ('site-1', 'Production US', 'us.example.com', 'production', 'us-east-1', '2.4.1', 'healthy', 9999,
   '{"cpuPercent": 45, "memoryPercent": 62, "diskPercent": 38, "networkInMbps": 125, "networkOutMbps": 89, "timestamp": "2026-02-02T00:00:00Z"}'::jsonb,
   '["core_authentication", "core_rses_engine", "feature_ai_suggestions", "feature_advanced_taxonomy"]'::jsonb,
   '["production", "primary"]'::jsonb, '2024-01-15T00:00:00Z'),
  ('site-2', 'Production EU', 'eu.example.com', 'production', 'eu-west-1', '2.4.1', 'healthy', 9995,
   '{"cpuPercent": 38, "memoryPercent": 55, "diskPercent": 42, "networkInMbps": 98, "networkOutMbps": 67, "timestamp": "2026-02-02T00:00:00Z"}'::jsonb,
   '["core_authentication", "core_rses_engine", "feature_advanced_taxonomy"]'::jsonb,
   '["production", "gdpr"]'::jsonb, '2024-02-01T00:00:00Z'),
  ('site-3', 'Staging', 'staging.example.com', 'staging', 'us-east-1', '2.5.0-beta', 'degraded', 9850,
   '{"cpuPercent": 72, "memoryPercent": 81, "diskPercent": 55, "networkInMbps": 45, "networkOutMbps": 32, "timestamp": "2026-02-02T00:00:00Z"}'::jsonb,
   '["core_authentication", "core_rses_engine", "feature_ai_suggestions", "feature_advanced_taxonomy", "beta_collaborative_editing", "beta_version_intelligence"]'::jsonb,
   '["staging", "beta"]'::jsonb, '2024-03-01T00:00:00Z'),
  ('site-4', 'Development', 'dev.example.com', 'development', 'us-east-1', '2.6.0-dev', 'healthy', 9500,
   '{"cpuPercent": 25, "memoryPercent": 35, "diskPercent": 22, "networkInMbps": 12, "networkOutMbps": 8, "timestamp": "2026-02-02T00:00:00Z"}'::jsonb,
   '["core_authentication", "core_rses_engine", "feature_ai_suggestions", "feature_advanced_taxonomy", "beta_collaborative_editing", "beta_version_intelligence", "experimental_quantum_taxonomy"]'::jsonb,
   '["development", "experimental"]'::jsonb, '2024-04-01T00:00:00Z')
ON CONFLICT ("id") DO NOTHING;
