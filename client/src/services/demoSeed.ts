import { ApiKey, AuditEvent, Role, User } from '../../../shared/types.js';
import { calculateAuditHash, GENESIS_HASH, hashApiKey } from './demoCrypto.js';

// An API key record as stored internally: the public ApiKey shape plus the
// hash used to look it up by bearer token. Never returned to callers as-is;
// see demoRepositories.ts, which strips key_hash before returning an
// ApiKey, the same way the server's SQL repositories never SELECT key_hash
// into a response body.
export interface DemoApiKeyRecord extends ApiKey {
  key_hash: string;
}

export interface DemoSeedState {
  users: User[];
  roles: Role[];
  apiKeys: DemoApiKeyRecord[];
  auditLedger: AuditEvent[];
}

// Same organization, people and mock tokens as server/src/db/seed.ts, so the
// GitHub Pages demo tells the same story as a freshly started local server.
// Timestamps are relative to when the seed runs (page load, or "Reset demo
// data"), matching how the server's seed looks freshly-initialized after
// every restart.
//
// The two API key tokens are deliberately the same fixed, clearly-fake mock
// values the server seeds locally (never a real secret), because the
// Security Sandbox's quick-preset buttons are hardcoded to them so the
// sandbox behaves identically whether it is talking to the real API or this
// in-browser demo.
export function createSeedState(): DemoSeedState {
  const now = Date.now();
  const past2h = new Date(now - 2 * 3600 * 1000).toISOString();
  const past30m = new Date(now - 30 * 60 * 1000).toISOString();

  const roles: Role[] = [
    {
      name: 'owner',
      display_name: 'Organization Owner',
      description: 'Full root authority over organization and billing',
      permissions: ['*'],
      is_system: true,
    },
    {
      name: 'admin',
      display_name: 'Security Admin',
      description: 'Manage users, roles, credentials, and deployment environments',
      permissions: ['users:*', 'roles:*', 'keys:*', 'audit:*', 'deploy:*'],
      is_system: true,
    },
    {
      name: 'developer',
      display_name: 'Software Engineer',
      description: 'Access developer services, deploy releases and generate scoped keys',
      permissions: ['users:read', 'keys:read', 'keys:create', 'deploy:read', 'deploy:execute'],
      is_system: true,
    },
    {
      name: 'security_auditor',
      display_name: 'Compliance Auditor',
      description: 'Inspect audit trails, permission policies, and security posture',
      permissions: ['users:read', 'roles:read', 'keys:read', 'audit:*'],
      is_system: true,
    },
    {
      name: 'billing_manager',
      display_name: 'Billing Manager',
      description: 'Manage subscriptions, payment methods, and invoices',
      permissions: ['billing:*', 'users:read'],
      is_system: true,
    },
    {
      name: 'viewer',
      display_name: 'Read-Only Viewer',
      description: 'Read-only access to non-sensitive dashboard metadata',
      permissions: ['users:read', 'roles:read', 'deploy:read'],
      is_system: true,
    },
  ];

  const users: User[] = [
    {
      id: 'user-1',
      email: 'laura.tamm@nordicfintech.ee',
      name: 'Laura Tamm',
      role: 'owner',
      status: 'active',
      mfa_enabled: true,
      last_login_at: past30m,
      created_at: past2h,
    },
    {
      id: 'user-2',
      email: 'erik.kallas@nordicfintech.ee',
      name: 'Erik Kallas',
      role: 'security_auditor',
      status: 'active',
      mfa_enabled: true,
      last_login_at: past2h,
      created_at: past2h,
    },
    {
      id: 'user-3',
      email: 'sander.sepp@nordicfintech.ee',
      name: 'Sander Sepp',
      role: 'developer',
      status: 'active',
      mfa_enabled: true,
      last_login_at: past30m,
      created_at: past2h,
    },
    {
      id: 'user-4',
      email: 'maria.kukk@nordicfintech.ee',
      name: 'Maria Kukk',
      role: 'billing_manager',
      status: 'active',
      mfa_enabled: false,
      last_login_at: past2h,
      created_at: past2h,
    },
  ];

  const key1Token = 'am_live_ci_cd_deployment_token_001_mock';
  const key2Token = 'am_live_security_scanner_token_002_mock';

  const apiKeys: DemoApiKeyRecord[] = [
    {
      id: 'key-1',
      name: 'CI/CD Production Deployment Token',
      key_prefix: 'am_live_ci_c...mock',
      key_hash: hashApiKey(key1Token),
      scopes: ['deploy:read', 'deploy:execute'],
      created_by: 'user-3',
      rate_limit_rpm: 120,
      last_used_at: past30m,
      expires_at: null,
      revoked_at: null,
      created_at: past2h,
    },
    {
      id: 'key-2',
      name: 'Compliance Security Scanner',
      key_prefix: 'am_live_secu...mock',
      key_hash: hashApiKey(key2Token),
      scopes: ['audit:read', 'keys:read'],
      created_by: 'user-2',
      rate_limit_rpm: 60,
      last_used_at: past2h,
      expires_at: null,
      revoked_at: null,
      created_at: past2h,
    },
  ];

  const a1Details = JSON.stringify({ description: 'Organization workspace initialized with zero-trust RBAC policies' });
  const a1Hash = calculateAuditHash({
    prev_hash: GENESIS_HASH,
    actor_id: 'user-1',
    action: 'tenant.initialized',
    resource: 'system',
    status: 'granted',
    created_at: past2h,
    details: a1Details,
  });

  const a2Details = JSON.stringify({ scopes: ['deploy:read', 'deploy:execute'], key_name: 'CI/CD Production Deployment Token' });
  const a2Hash = calculateAuditHash({
    prev_hash: a1Hash,
    actor_id: 'user-3',
    action: 'api_key.created',
    resource: 'keys',
    status: 'granted',
    created_at: past30m,
    details: a2Details,
  });

  const auditLedger: AuditEvent[] = [
    {
      id: 'audit-1',
      actor_type: 'user',
      actor_id: 'user-1',
      actor_name: 'Laura Tamm',
      action: 'tenant.initialized',
      resource: 'system',
      status: 'granted',
      ip_address: '82.131.44.12',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      details: a1Details,
      prev_hash: GENESIS_HASH,
      hash: a1Hash,
      created_at: past2h,
    },
    {
      id: 'audit-2',
      actor_type: 'user',
      actor_id: 'user-3',
      actor_name: 'Sander Sepp',
      action: 'api_key.created',
      resource: 'keys',
      status: 'granted',
      ip_address: '82.131.44.12',
      user_agent: 'Mozilla/5.0 (X11; Linux x86_64)',
      details: a2Details,
      prev_hash: a1Hash,
      hash: a2Hash,
      created_at: past30m,
    },
  ];

  return { users, roles, apiKeys, auditLedger };
}
