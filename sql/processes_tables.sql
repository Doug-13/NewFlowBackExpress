-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100),
  description TEXT,
  workflow_id UUID,
  parent_process_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '{"userIds":[],"groupIds":[]}'::jsonb,
  document_creation JSONB NOT NULL DEFAULT '{"userIds":[],"groupIds":[]}'::jsonb,
  document_visualization JSONB NOT NULL DEFAULT '{"userIds":[],"groupIds":[]}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processes_account_id
  ON processes(account_id);

CREATE INDEX IF NOT EXISTS idx_processes_account_status
  ON processes(account_id, status);
