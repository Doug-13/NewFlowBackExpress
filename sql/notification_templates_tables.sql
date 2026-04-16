CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(100) NOT NULL,
  description TEXT,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'system', 'whatsapp')),
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_account_id
  ON notification_templates(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_account_code
  ON notification_templates(account_id, code);
