CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS metadata_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100),
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metadata_sets_account_code
  ON metadata_sets(account_id, code);

CREATE TABLE IF NOT EXISTS metadata_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100),
  name VARCHAR(150) NOT NULL,
  label VARCHAR(150) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  mask_type VARCHAR(50),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  order_index INTEGER NOT NULL DEFAULT 1,
  metadata_set_id UUID,
  metadata_set_name VARCHAR(150),
  document_type_id VARCHAR(100),
  multiple_selection BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  table_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_metadata_definitions_set
    FOREIGN KEY (metadata_set_id) REFERENCES metadata_sets(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_metadata_definitions_account_set_order
  ON metadata_definitions(account_id, metadata_set_id, order_index);

CREATE INDEX IF NOT EXISTS idx_metadata_definitions_account_name
  ON metadata_definitions(account_id, name);

CREATE TABLE IF NOT EXISTS metadata_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_instance_id UUID NOT NULL,
  metadata_definition_id UUID NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  process_id VARCHAR(100),
  name VARCHAR(150),
  label VARCHAR(150),
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  mask_type VARCHAR(50),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  value JSONB,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  table_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_metadata_values_document_definition UNIQUE (document_instance_id, metadata_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_metadata_values_document_instance
  ON metadata_values(document_instance_id);

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
