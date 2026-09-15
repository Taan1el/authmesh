import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { PolicyService } from '../../shared/policy.service.js';
import { RateLimiterService } from '../../shared/rate-limiter.service.js';
import { calculateAuditHash, hashApiKey } from '../src/utils/crypto.js';

describe('AuthMesh Security Gateway & RBAC Engine', () => {
  let app: any;

  beforeEach(() => {
    // Isolated in-memory SQLite database
    const context = createApp(':memory:', true);
    app = context.app;
  });

  describe('Health check', () => {
    it('returns healthy status and ISO timestamp', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('PolicyService wildcard permission evaluation', () => {
    const policy = new PolicyService();

    it('matches exact permissions', () => {
      expect(policy.matches('users:read', 'users:read')).toBe(true);
      expect(policy.matches('users:read', 'users:write')).toBe(false);
    });

    it('matches universal wildcard *', () => {
      expect(policy.matches('*', 'billing:write')).toBe(true);
      expect(policy.matches('*', 'deploy:execute')).toBe(true);
    });

    it('matches namespace wildcards (e.g., users:* matches users:delete)', () => {
      expect(policy.matches('users:*', 'users:delete')).toBe(true);
      expect(policy.matches('users:*', 'users:read')).toBe(true);
      expect(policy.matches('users:*', 'billing:read')).toBe(false);
    });

    it('evaluates permission array correctly', () => {
      const scopes = ['users:read', 'deploy:*'];
      expect(policy.hasPermission(scopes, 'deploy:execute').allowed).toBe(true);
      expect(policy.hasPermission(scopes, 'billing:write').allowed).toBe(false);
    });
  });

  describe('RateLimiterService sliding window mechanism', () => {
    it('allows requests within limit and enforces quota cutoff', () => {
      const limiter = new RateLimiterService();
      const keyId = 'test-key-1';
      const limit = 3;

      const r1 = limiter.checkRateLimit(keyId, limit);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.checkRateLimit(keyId, limit);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.checkRateLimit(keyId, limit);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request must be rejected
      const r4 = limiter.checkRateLimit(keyId, limit);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetSeconds).toBeGreaterThan(0);
    });
  });

  describe('User & Role Administration', () => {
    it('lists seeded organization users with roles', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);

      const names = res.body.data.map((u: any) => u.name);
      expect(names).toContain('Laura Tamm');
      expect(names).toContain('Sander Sepp');
    });

    it('creates a new user and records audit log', async () => {
      const newUser = {
        name: 'Taavi Oja',
        email: 'taavi.oja@nordicfintech.ee',
        role: 'developer',
        mfa_enabled: true,
      };

      const res = await request(app).post('/api/users').send(newUser);
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Taavi Oja');
      expect(res.body.data.role).toBe('developer');

      // Verify audit entry
      const auditRes = await request(app).get('/api/audit?limit=5');
      expect(auditRes.body.data.some((a: any) => a.action === 'user.created')).toBe(true);
    });

    it('updates user role', async () => {
      const listRes = await request(app).get('/api/users');
      const dev = listRes.body.data.find((u: any) => u.role === 'developer');

      const patchRes = await request(app)
        .patch(`/api/users/${dev.id}/role`)
        .send({ role: 'admin' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.role).toBe('admin');
    });

    it('suspends and reactivates user account', async () => {
      const listRes = await request(app).get('/api/users');
      const user = listRes.body.data[0];

      const suspendRes = await request(app)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'suspended' });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.status).toBe('suspended');

      const reactivateRes = await request(app)
        .patch(`/api/users/${user.id}/status`)
        .send({ status: 'active' });

      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.data.status).toBe('active');
    });

    it('lists system roles with permission sets', async () => {
      const res = await request(app).get('/api/roles');
      expect(res.status).toBe(200);
      const ownerRole = res.body.data.find((r: any) => r.name === 'owner');
      expect(ownerRole.permissions).toContain('*');
    });

    it('updates a role permission set and persists the change', async () => {
      const res = await request(app)
        .put('/api/roles/viewer/permissions')
        .send({ permissions: ['users:read', 'billing:*'] });

      expect(res.status).toBe(200);
      expect(res.body.data.permissions).toEqual(['users:read', 'billing:*']);

      const listRes = await request(app).get('/api/roles');
      const viewerRole = listRes.body.data.find((r: any) => r.name === 'viewer');
      expect(viewerRole.permissions).toEqual(['users:read', 'billing:*']);

      const auditRes = await request(app).get('/api/audit?limit=5');
      expect(auditRes.body.data.some((a: any) => a.action === 'role.permissions_updated')).toBe(true);
    });
  });

  describe('API Key Cryptographic Token Generation & Revocation', () => {
    it('generates a new scoped API key and returns plaintext token only once', async () => {
      const createRes = await request(app).post('/api/keys').send({
        name: 'Stripe Webhook Ingestion Service',
        scopes: ['billing:write', 'billing:read'],
        rate_limit_rpm: 90,
      });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.plaintext_token).toMatch(/^am_live_[a-f0-9]{48}$/);
      expect(createRes.body.data.key_prefix).toContain('am_live_');
      expect(createRes.body.data.scopes).toEqual(['billing:write', 'billing:read']);

      // Subsequent fetch must NOT return the plaintext secret
      const listRes = await request(app).get('/api/keys');
      const found = listRes.body.data.find((k: any) => k.id === createRes.body.data.id);
      expect(found).toBeDefined();
      expect(found.plaintext_token).toBeUndefined();
    });

    it('revokes an API key and prevents subsequent access', async () => {
      const createRes = await request(app).post('/api/keys').send({
        name: 'Temporary Token',
        scopes: ['deploy:execute'],
      });

      const keyId = createRes.body.data.id;
      const rawToken = createRes.body.data.plaintext_token;

      // Access should succeed first
      const firstCheck = await request(app)
        .post('/api/protected/deploy')
        .set('Authorization', `Bearer ${rawToken}`);
      expect(firstCheck.status).toBe(200);

      // Revoke the key
      const revokeRes = await request(app).delete(`/api/keys/${keyId}`);
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.revoked_at).toBeDefined();

      // Subsequent access must be rejected with 403 Forbidden
      const secondCheck = await request(app)
        .post('/api/protected/deploy')
        .set('Authorization', `Bearer ${rawToken}`);
      expect(secondCheck.status).toBe(403);
      expect(secondCheck.body.error).toContain('revoked');
    });
  });

  describe('Protected Sandbox Endpoints & RBAC Middleware', () => {
    it('blocks unauthenticated requests to protected endpoints with 403 or 401', async () => {
      const res = await request(app).get('/api/protected/billing');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows access to billing endpoint when API key has billing:read scope', async () => {
      const createRes = await request(app).post('/api/keys').send({
        name: 'Finance Service Key',
        scopes: ['billing:read'],
      });
      const token = createRes.body.data.plaintext_token;

      const res = await request(app)
        .get('/api/protected/billing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.monthly_mrr_eur).toBe(14500);
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('rejects access to billing when key only has deploy scopes (403 Forbidden)', async () => {
      const createRes = await request(app).post('/api/keys').send({
        name: 'Deployment Runner',
        scopes: ['deploy:execute'],
      });
      const token = createRes.body.data.plaintext_token;

      const res = await request(app)
        .get('/api/protected/billing')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('lacks required permission');
    });

    it('allows access when user has owner role via x-user-id header', async () => {
      const listRes = await request(app).get('/api/users');
      const owner = listRes.body.data.find((u: any) => u.role === 'owner');

      const res = await request(app)
        .get('/api/protected/billing')
        .set('x-user-id', owner.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('enforces rate limits on high-frequency API key requests (429 Too Many Requests)', async () => {
      const createRes = await request(app).post('/api/keys').send({
        name: 'Strict Rate Limited Key',
        scopes: ['users:read'],
        rate_limit_rpm: 2, // Limit to 2 requests per minute
      });
      const token = createRes.body.data.plaintext_token;

      const req1 = await request(app).get('/api/protected/users').set('Authorization', `Bearer ${token}`);
      expect(req1.status).toBe(200);

      const req2 = await request(app).get('/api/protected/users').set('Authorization', `Bearer ${token}`);
      expect(req2.status).toBe(200);

      // 3rd request breaches limit
      const req3 = await request(app).get('/api/protected/users').set('Authorization', `Bearer ${token}`);
      expect(req3.status).toBe(429);
      expect(req3.body.error).toContain('Rate limit quota exceeded');
    });
  });

  describe('Cryptographic Audit Chain & Integrity Verification', () => {
    it('verifies valid cryptographic hash chain across audit blocks', async () => {
      const res = await request(app).get('/api/auth/verify-chain');
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.totalBlocks).toBeGreaterThanOrEqual(2);
    });

    it('calculates tenant security posture metrics', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('security_score');
      expect(res.body.data).toHaveProperty('audit_chain_valid');
      expect(res.body.data).toHaveProperty('mfa_adoption_pct');
      expect(res.body.data.audit_chain_valid).toBe(true);
      expect(res.body.data.security_score).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Input validation', () => {
    it('rejects user creation with a malformed email and does not create a row', async () => {
      const before = await request(app).get('/api/users');

      const res = await request(app).post('/api/users').send({
        name: 'Bad Email',
        email: 'not-an-email',
        role: 'developer',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/email/i);

      const after = await request(app).get('/api/users');
      expect(after.body.data.length).toBe(before.body.data.length);
    });

    it('rejects user creation with an unknown role', async () => {
      const res = await request(app).post('/api/users').send({
        name: 'Bad Role',
        email: 'bad.role@example.com',
        role: 'superuser',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/role/i);
    });

    it('rejects a duplicate email address', async () => {
      const listRes = await request(app).get('/api/users');
      const existingEmail = listRes.body.data[0].email;

      const res = await request(app).post('/api/users').send({
        name: 'Duplicate',
        email: existingEmail,
        role: 'viewer',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('returns 404, not a silent success, when updating the role of an unknown user', async () => {
      const res = await request(app)
        .patch('/api/users/does-not-exist/role')
        .send({ role: 'admin' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 when suspending an unknown user', async () => {
      const res = await request(app)
        .patch('/api/users/does-not-exist/status')
        .send({ status: 'suspended' });

      expect(res.status).toBe(404);
    });

    it('rejects a role update to an unrecognized role name', async () => {
      const listRes = await request(app).get('/api/users');
      const user = listRes.body.data[0];

      const res = await request(app)
        .patch(`/api/users/${user.id}/role`)
        .send({ role: 'god-mode' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when updating permissions for an unknown role', async () => {
      const res = await request(app)
        .put('/api/roles/not-a-role/permissions')
        .send({ permissions: ['users:read'] });

      expect(res.status).toBe(404);
    });

    it('rejects malformed permission strings', async () => {
      const res = await request(app)
        .put('/api/roles/viewer/permissions')
        .send({ permissions: ['not a permission!!'] });

      expect(res.status).toBe(400);
    });

    it('rejects API key creation with an empty scopes array', async () => {
      const res = await request(app).post('/api/keys').send({
        name: 'Empty Scope Key',
        scopes: [],
      });

      expect(res.status).toBe(400);
    });

    it('clamps an out-of-range rate limit instead of storing it as-is', async () => {
      const res = await request(app).post('/api/keys').send({
        name: 'Huge RPM Key',
        scopes: ['users:read'],
        rate_limit_rpm: 999999999,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.rate_limit_rpm).toBeLessThanOrEqual(10000);
    });

    it('returns 404 when revoking an unknown API key', async () => {
      const res = await request(app).delete('/api/keys/does-not-exist');
      expect(res.status).toBe(404);
    });

    it('falls back to a default page size when the audit limit is not a number', async () => {
      const res = await request(app).get('/api/audit?limit=not-a-number');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('never leaks a raw error message or stack trace to the client', async () => {
      const res = await request(app).post('/api/users').send({
        name: 'X',
        email: 'bad',
        role: 'owner',
      });

      expect(res.body.error).not.toMatch(/at Object|at Module|\.ts:\d+|\.js:\d+/);
    });
  });
});
