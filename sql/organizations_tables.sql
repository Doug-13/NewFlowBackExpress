-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organization_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100),
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'area' CHECK (type IN ('area', 'unit')),
  unit_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_areas_account_type
  ON organization_areas(account_id, type);

CREATE TABLE IF NOT EXISTS organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100),
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'role' CHECK (type IN ('role', 'discipline')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_roles_account_type
  ON organization_roles(account_id, type);

CREATE TABLE IF NOT EXISTS organization_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100),
  description TEXT,
  member_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  member_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_groups_account_id
  ON organization_groups(account_id);
