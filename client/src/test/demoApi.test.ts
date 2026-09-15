import { describe, it, expect, beforeEach } from 'vitest';
import { api, resetDemoData } from '../services/demoApi.js';
import { DemoDatabase } from '../services/demoDatabase.js';

// The demo adapter is the entire data and policy layer on GitHub Pages (no
// API server exists there), so it gets the same kind of coverage the real
// API's integration tests get: seeded data, RBAC grants and denials, rate
// limiting, the audit hash chain, validation, and persistence across a
// simulated page reload (a new DemoDatabase instance).
describe('demoApi (in-browser data and policy layer)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoData();
  });

  describe('seed data', () => {
    it('starts from the same organization the local server seeds', async () => {
      const users = await api.getUsers();
      expect(users).toHaveLength(4);
      expect(users.map((u) => u.name).sort()).toEqual([
        'Erik Kallas',
        'Laura Tamm',
        'Maria Kukk',
        'Sander Sepp',
      ]);

      const roles = await api.getRoles();
      expect(roles.map((r) => r.name).sort()).toEqual([
        'admin',
        'billing_manager',
        'developer',
        'owner',
        'security_auditor',
        'viewer',
      ]);

      const keys = await api.getKeys();
      expect(keys).toHaveLength(2);
      // Plaintext tokens are never returned for existing keys, only at
      // creation time, same as the real API.
      expect(keys.every((k) => !('plaintext_token' in k))).toBe(true);

      const audit = await api.getAudit();
      expect(audit).toHaveLength(2);
    });

    it('reports tenant metrics consistent with the seeded users and audit chain', async () => {
      const metrics = await api.getMetrics();
      expect(metrics.total_users).toBe(4);
      expect(metrics.active_api_keys).toBe(2);
      expect(metrics.mfa_adoption_pct).toBe(75); // 3 of 4 seeded users have MFA enabled
      expect(metrics.audit_chain_valid).toBe(true);

      const chain = await api.verifyAuditChain();
      expect(chain.valid).toBe(true);
      expect(chain.totalBlocks).toBe(2);
    });
  });

  describe('user administration', () => {
    it('creates a user, rejecting a bad email, unknown role, or duplicate email', async () => {
      await expect(
        api.createUser({ name: 'Bad Email', email: 'not-an-email', role: 'developer' })
      ).rejects.toThrow(/email/i);

      await expect(
        api.createUser({ name: 'Bad Role', email: 'new.person@example.com', role: 'superuser' as any })
      ).rejects.toThrow(/role/i);

      await expect(
        api.createUser({ name: 'Duplicate', email: 'laura.tamm@nordicfintech.ee', role: 'viewer' })
      ).rejects.toThrow(/already exists/i);

      const created = await api.createUser({
        name: 'Kaspar Kuus',
        email: 'kaspar.kuus@nordicfintech.ee',
        role: 'viewer',
        mfa_enabled: false,
      });
      expect(created.status).toBe('active');

      const users = await api.getUsers();
      expect(users.some((u) => u.email === 'kaspar.kuus@nordicfintech.ee')).toBe(true);

      const audit = await api.getAudit(5);
      expect(audit.some((a) => a.action === 'user.created')).toBe(true);
    });

    it('updates a user role and status, 404ing for an unknown id', async () => {
      const users = await api.getUsers();
      const developer = users.find((u) => u.role === 'developer')!;

      const promoted = await api.updateUserRole(developer.id, 'admin');
      expect(promoted.role).toBe('admin');

      const suspended = await api.updateUserStatus(developer.id, 'suspended');
      expect(suspended.status).toBe('suspended');

      await expect(api.updateUserRole('does-not-exist', 'admin')).rejects.toThrow(/not found/i);
      await expect(api.updateUserStatus('does-not-exist', 'active')).rejects.toThrow(/not found/i);
    });
  });

  describe('API key vault', () => {
    it('creates a key attributed to the oldest user and reveals the token once', async () => {
      const key = await api.createKey({ name: 'Test Key', scopes: ['users:read'] });
      expect(key.plaintext_token).toMatch(/^am_live_[a-f0-9]{48}$/);

      const users = await api.getUsers();
      expect(key.created_by).toBe(users[0].id);

      const keys = await api.getKeys();
      const stored = keys.find((k) => k.id === key.id);
      expect(stored).toBeDefined();
      expect((stored as any).plaintext_token).toBeUndefined();
      expect((stored as any).key_hash).toBeUndefined();
    });

    it('revokes a key and blocks further protected access with it', async () => {
      const created = await api.createKey({ name: 'Temp', scopes: ['deploy:execute'] });

      const before = await api.simulateProtectedRequest('deploy', 'POST', 'token', created.plaintext_token);
      expect(before.status).toBe(200);

      await api.revokeKey(created.id);

      const after = await api.simulateProtectedRequest('deploy', 'POST', 'token', created.plaintext_token);
      expect(after.status).toBe(403);
      expect(after.data.error).toMatch(/revoked/i);

      await expect(api.revokeKey('does-not-exist')).rejects.toThrow(/not found/i);
    });
  });

  describe('RBAC evaluation through the sandbox endpoints', () => {
    it('grants access to a user whose role includes the required permission', async () => {
      const users = await api.getUsers();
      const owner = users.find((u) => u.role === 'owner')!;

      const res = await api.simulateProtectedRequest('billing', 'GET', 'user', owner.id);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.monthly_mrr_eur).toBe(14500);
    });

    it('denies access to a user whose role lacks the required permission', async () => {
      const users = await api.getUsers();
      const developer = users.find((u) => u.role === 'developer')!;

      const res = await api.simulateProtectedRequest('billing', 'GET', 'user', developer.id);
      expect(res.status).toBe(403);
      expect(res.data.error).toMatch(/lacks permission/i);
    });

    it('rejects an unrecognized bearer token with 401', async () => {
      const res = await api.simulateProtectedRequest('users', 'GET', 'token', 'am_live_not_a_real_token');
      expect(res.status).toBe(401);
    });

    it('enforces the sliding-window rate limit on a low-quota key with 429', async () => {
      const key = await api.createKey({ name: 'Strict', scopes: ['users:read'], rate_limit_rpm: 2 });

      const first = await api.simulateProtectedRequest('users', 'GET', 'token', key.plaintext_token);
      const second = await api.simulateProtectedRequest('users', 'GET', 'token', key.plaintext_token);
      const third = await api.simulateProtectedRequest('users', 'GET', 'token', key.plaintext_token);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.headers['x-ratelimit-remaining']).toBe('0');
    });

    it('records a granted evaluation in the audit ledger and keeps the chain valid', async () => {
      const users = await api.getUsers();
      const owner = users.find((u) => u.role === 'owner')!;

      await api.simulateProtectedRequest('users', 'GET', 'user', owner.id);

      const audit = await api.getAudit(5);
      expect(audit.some((a) => a.action === 'users.access')).toBe(true);

      const chain = await api.verifyAuditChain();
      expect(chain.valid).toBe(true);
    });
  });

  describe('reset and persistence', () => {
    it('resetDemoData restores the seed scenario and clears rate limit counters', async () => {
      await api.createUser({ name: 'Extra', email: 'extra@example.com', role: 'viewer' });
      const key = await api.createKey({ name: 'Burner', scopes: ['users:read'], rate_limit_rpm: 1 });
      await api.simulateProtectedRequest('users', 'GET', 'token', key.plaintext_token);
      const limited = await api.simulateProtectedRequest('users', 'GET', 'token', key.plaintext_token);
      expect(limited.status).toBe(429);

      resetDemoData();

      const users = await api.getUsers();
      expect(users).toHaveLength(4);
      const keys = await api.getKeys();
      expect(keys).toHaveLength(2);
    });

    it('persists mutations to localStorage so a fresh DemoDatabase instance sees them', async () => {
      await api.createUser({ name: 'Persisted Person', email: 'persisted@example.com', role: 'viewer' });

      // Simulate a page reload: a brand new DemoDatabase should read back
      // whatever was last persisted instead of re-seeding from scratch.
      const reloaded = new DemoDatabase();
      expect(reloaded.users.some((u) => u.email === 'persisted@example.com')).toBe(true);
    });
  });
});
