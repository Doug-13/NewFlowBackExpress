CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  process_id VARCHAR(100) NOT NULL,
  process_name VARCHAR(180),
  title VARCHAR(255) NOT NULL,
  code VARCHAR(60) NOT NULL UNIQUE,
  revision VARCHAR(10) NOT NULL DEFAULT '00',
  parent_document_id UUID NULL REFERENCES document_instances(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'in_progress', 'approved', 'rejected', 'published', 'archived', 'cancelled')
  ),
  workflow_id VARCHAR(100) NOT NULL,
  workflow_name VARCHAR(180),
  current_step_name VARCHAR(180),
  current_step_order_index INTEGER,
  responsible_id VARCHAR(100),
  responsible_name VARCHAR(180),
  created_by_id VARCHAR(100) NOT NULL,
  created_by_name VARCHAR(180),
  due_date TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_instances_account_status
  ON document_instances(account_id, status);

CREATE INDEX IF NOT EXISTS idx_document_instances_account_process
  ON document_instances(account_id, process_id);

CREATE INDEX IF NOT EXISTS idx_document_instances_workflow_step
  ON document_instances(workflow_id, current_step_order_index);

CREATE INDEX IF NOT EXISTS idx_document_instances_created_by
  ON document_instances(created_by_id);

CREATE INDEX IF NOT EXISTS idx_document_instances_parent
  ON document_instances(parent_document_id);

CREATE TABLE IF NOT EXISTS metadata_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  metadata_definition_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  process_id VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_metadata_values_document_definition UNIQUE (document_instance_id, metadata_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_metadata_values_document_instance
  ON metadata_values(document_instance_id);

CREATE INDEX IF NOT EXISTS idx_metadata_values_definition
  ON metadata_values(metadata_definition_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  action VARCHAR(120) NOT NULL,
  step_name VARCHAR(180),
  user_name VARCHAR(180),
  comment TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_document_instance
  ON audit_logs(document_instance_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  step_order_index INTEGER,
  step_name VARCHAR(180),
  element_id VARCHAR(120),
  assigned_user_id VARCHAR(100),
  assigned_user_name VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  action_taken VARCHAR(100),
  comment TEXT,
  due_date TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_document_instance
  ON tasks(document_instance_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);

CREATE INDEX IF NOT EXISTS idx_tasks_step_order
  ON tasks(step_order_index);
