import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { calculateAuditHash, hashApiKey } from '../utils/crypto.js';

export function seedDatabase(db: DatabaseSync): void {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users;').get() as { count: number };
  if (userCount.count > 0) return;

  const now = new Date().toISOString();
  const past2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const past30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // 1. Seed Roles
  const insertRole = db.prepare(`
    INSERT INTO roles (name, display_name, description, permissions, is_system)
    VALUES (?, ?, ?, ?, ?);
  `);

  insertRole.run('owner', 'Organization Owner', 'Full root authority over organization and billing', JSON.stringify(['*']), 1);
  insertRole.run('admin', 'Security Admin', 'Manage users, roles, credentials, and deployment environments', JSON.stringify(['users:*', 'roles:*', 'keys:*', 'audit:*', 'deploy:*']), 1);
  insertRole.run('developer', 'Software Engineer', 'Access developer services, deploy releases and generate scoped keys', JSON.stringify(['users:read', 'keys:read', 'keys:create', 'deploy:read', 'deploy:execute']), 1);
  insertRole.run('security_auditor', 'Compliance Auditor', 'Inspect audit trails, permission policies, and security posture', JSON.stringify(['users:read', 'roles:read', 'keys:read', 'audit:*']), 1);
  insertRole.run('billing_manager', 'Billing Manager', 'Manage subscriptions, payment methods, and invoices', JSON.stringify(['billing:*', 'users:read']), 1);
  insertRole.run('viewer', 'Read-Only Viewer', 'Read-only access to non-sensitive dashboard metadata', JSON.stringify(['users:read', 'roles:read', 'deploy:read']), 1);

  // 2. Seed Users
  const u1 = crypto.randomUUID();
  const u2 = crypto.randomUUID();
  const u3 = crypto.randomUUID();
  const u4 = crypto.randomUUID();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, role, status, mfa_enabled, last_login_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  insertUser.run(u1, 'laura.tamm@nordicfintech.ee', 'Laura Tamm', 'owner', 'active', 1, past30m, past2h);
  insertUser.run(u2, 'erik.kallas@nordicfintech.ee', 'Erik Kallas', 'security_auditor', 'active', 1, past2h, past2h);
  insertUser.run(u3, 'sander.sepp@nordicfintech.ee', 'Sander Sepp', 'developer', 'active', 1, past30m, past2h);
  insertUser.run(u4, 'maria.kukk@nordicfintech.ee', 'Maria Kukk', 'billing_manager', 'active', 0, past2h, past2h);

  // 3. Seed API Keys
  const insertKey = db.prepare(`
    INSERT INTO api_keys (id, name, key_prefix, key_hash, scopes, created_by, rate_limit_rpm, last_used_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const key1Token = 'am_live_ci_cd_deployment_token_001_mock';
  const key2Token = 'am_live_security_scanner_token_002_mock';

  insertKey.run(
    crypto.randomUUID(),
    'CI/CD Production Deployment Token',
    'am_live_ci_c...mock',
    hashApiKey(key1Token),
    JSON.stringify(['deploy:read', 'deploy:execute']),
    u3,
    120,
    past30m,
    past2h
  );

  insertKey.run(
    crypto.randomUUID(),
    'Compliance Security Scanner',
    'am_live_secu...mock',
    hashApiKey(key2Token),
    JSON.stringify(['audit:read', 'keys:read']),
    u2,
    60,
    past2h,
    past2h
  );

  // 4. Seed Cryptographically Chained Audit Ledger
  const insertAudit = db.prepare(`
    INSERT INTO audit_ledger (
      id, actor_type, actor_id, actor_name, action, resource,
      status, ip_address, user_agent, details, prev_hash, hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const genesisPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const a1Details = JSON.stringify({ description: 'Organization workspace initialized with zero-trust RBAC policies' });
  const a1Hash = calculateAuditHash({
    prev_hash: genesisPrevHash,
    actor_id: u1,
    action: 'tenant.initialized',
    resource: 'system',
    status: 'granted',
    created_at: past2h,
    details: a1Details,
  });

  insertAudit.run(
    crypto.randomUUID(),
    'user',
    u1,
    'Laura Tamm',
    'tenant.initialized',
    'system',
    'granted',
    '82.131.44.12',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    a1Details,
    genesisPrevHash,
    a1Hash,
    past2h
  );

  const a2Details = JSON.stringify({ scopes: ['deploy:read', 'deploy:execute'], key_name: 'CI/CD Production Deployment Token' });
  const a2Hash = calculateAuditHash({
    prev_hash: a1Hash,
    actor_id: u3,
    action: 'api_key.created',
    resource: 'keys',
    status: 'granted',
    created_at: past30m,
    details: a2Details,
  });

  insertAudit.run(
    crypto.randomUUID(),
    'user',
    u3,
    'Sander Sepp',
    'api_key.created',
    'keys',
    'granted',
    '82.131.44.12',
    'Mozilla/5.0 (X11; Linux x86_64)',
    a2Details,
    a1Hash,
    a2Hash,
    past30m
  );
}
