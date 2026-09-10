import { DatabaseSync } from 'node:sqlite';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      permissions TEXT NOT NULL, -- JSON string array
      is_system INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      scopes TEXT NOT NULL, -- JSON string array
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
      last_used_at TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_keys_created_by ON api_keys(created_by);

    CREATE TABLE IF NOT EXISTS audit_ledger (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      status TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      details TEXT NOT NULL, -- JSON string
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_ledger(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_ledger(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_ledger(resource);
  `);
}
