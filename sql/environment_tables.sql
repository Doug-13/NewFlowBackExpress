CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS environment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL UNIQUE,
  revision JSONB NOT NULL DEFAULT '{}'::jsonb,
  creation_mode JSONB NOT NULL DEFAULT '{}'::jsonb,
  coding_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  sequential JSONB NOT NULL DEFAULT '{}'::jsonb,
  deadlines JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_environment_settings_account_id
  ON environment_settings(account_id);
