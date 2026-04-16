-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  process_id VARCHAR(100) NOT NULL,
  process_name VARCHAR(150),
  document_instance_id UUID NOT NULL,
  document_title VARCHAR(255),
  document_code VARCHAR(100),
  step_name VARCHAR(150) NOT NULL,
  step_order_index INTEGER NOT NULL,
  element_id VARCHAR(150),
  assigned_user_id VARCHAR(100) NOT NULL,
  assigned_user_name VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),
  allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken VARCHAR(100),
  comment TEXT,
  deadline_mode VARCHAR(50),
  deadline_value INTEGER,
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_document_status
  ON tasks(document_instance_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
  ON tasks(assigned_user_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_account_status
  ON tasks(account_id, status);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  step_name VARCHAR(150),
  user_name VARCHAR(150),
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_document_created_at
  ON audit_logs(document_instance_id, created_at DESC);
