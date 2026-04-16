CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL UNIQUE,
  account_id VARCHAR(100) NOT NULL,
  process_id VARCHAR(100),
  process_name VARCHAR(200),
  environment_id VARCHAR(100),
  environment_name VARCHAR(200),
  name VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  version VARCHAR(50) NOT NULL DEFAULT '1.0',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  document_type_id VARCHAR(100),
  document_type_name VARCHAR(200),
  bpmn_xml TEXT NOT NULL DEFAULT '',
  steps_count INTEGER NOT NULL DEFAULT 0,
  permissions JSONB NOT NULL DEFAULT '{"visualization":{"userIds":[],"groupIds":[],"environmentIds":[],"processIds":[],"areaIds":[],"disciplineIds":[],"roleIds":[],"unitIds":[]},"creation":{"userIds":[],"groupIds":[],"environmentIds":[],"processIds":[],"areaIds":[],"disciplineIds":[],"roleIds":[],"unitIds":[]}}'::jsonb,
  element_configs JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope_level VARCHAR(20) NOT NULL DEFAULT 'process'
    CHECK (scope_level IN ('account', 'environment', 'process')),
  tenant_id VARCHAR(100),
  account_name VARCHAR(200),
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_account_id
  ON workflows(account_id);

CREATE INDEX IF NOT EXISTS idx_workflows_account_updated_created
  ON workflows(account_id, updated_at DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_account_process_unique
  ON workflows(account_id, process_id)
  WHERE process_id IS NOT NULL;
