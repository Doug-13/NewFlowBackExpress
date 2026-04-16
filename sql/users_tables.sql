CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  cpf VARCHAR(30),
  phone VARCHAR(50),
  photo_url TEXT,
  department VARCHAR(150),
  job_title VARCHAR(150),
  position VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_account_id
  ON users(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

CREATE TABLE IF NOT EXISTS user_process_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id VARCHAR(100) NOT NULL,
  process_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_process_memberships_user_id
  ON user_process_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_user_process_memberships_account_process
  ON user_process_memberships(account_id, process_id);
