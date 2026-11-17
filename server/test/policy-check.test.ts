import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { AuthService } from '../../shared/auth.service.js';
import { PolicyService } from '../../shared/policy.service.js';
import { RateLimiterService } from '../../shared/rate-limiter.service.js';
import { checkAccess, findMember, requestedPermissionProblem, rolesGranting } from '../../shared/policy-check.js';
import { findRoute, PROTECTED_ROUTES } from '../../shared/routes.js';
import { policyFromSample, type Policy } from '../../shared/policy-file.js';
import { STANDARD_PERMISSIONS } from '../../shared/validation.js';
import type { RoleName, User } from '../../shared/types.js';
import { createSeedState } from '../../client/src/services/demoSeed.js';
import { hashApiKey } from '../src/utils/crypto.js';

const policy: Policy = {
  tenant: 'Example Org',
  roles: [
    { name: 'owner', description: '', permissions: ['*'] },
    { name: 'billing', description: '', permissions: ['billing:*', 'users:read'] },
    { name: 'reader', description: '', permissions: ['users:read', 'deploy:read'] },
    { name: 'nobody', description: '', permissions: [] },
  ],
  members: [
    { email: 'olga@example.test', name: 'Olga Owner', role: 'owner', status: 'active' },
    { email: 'ben@example.test', name: 'Ben Biller', role: 'billing', status: 'active' },
    { email: 'rita@example.test', name: 'Rita Reader', role: 'reader', status: 'active' },
    { email: 'sam@example.test', name: 'Sam Suspended', role: 'owner', status: 'suspended' },
    { email: 'nia@example.test', name: 'Nia Nobody', role: 'nobody', status: 'active' },
  ],
};

// Runs the server's own AuthService over the policy, with throwaway
// repositories, and returns what it decides for a member and a permission.
function serverDecision(source: Policy, email: string, permission: string) {
  const users = source.members.map((member, index) => ({ id: `u${index}`, email: member.email, name: member.name, role: member.role as RoleName, status: member.status }));
  const roles = source.roles.map((role) => ({ name: role.name as RoleName, display_name: role.name, description: '', permissions: role.permissions, is_system: false }));
  const user = users.find((item) => item.email === email) as User;
  const service = new AuthService(
    {} as never,
    { getUserById: (id: string) => users.find((item) => item.id === id) ?? null } as never,
    { getRoleByName: (name: string) => roles.find((item) => item.name === name) ?? null } as never,
    { recordAuditEvent: () => ({}) } as never,
    new PolicyService(),
    new RateLimiterService(),
    hashApiKey
  );
  return service.evaluateAccess({ user_id: user.id, permission, resource: 'x' });
}

describe('policy tester agrees with the server decision', () => {
  it('returns the same allow or deny and the same reason as AuthService for every member and permission', () => {
    const permissions = [...STANDARD_PERMISSIONS, 'custom:thing', 'billing:refund'];
    let compared = 0;
    for (const member of policy.members) {
      for (const permission of permissions) {
        const server = serverDecision(policy, member.email, permission);
        const local = checkAccess(policy, { kind: 'member', query: member.email }, { kind: 'permission', permission });
        expect({ who: member.email, permission, allowed: local.allowed, reason: local.reason, scope: local.matchingScope }).toEqual({
          who: member.email,
          permission,
          allowed: server.allowed,
          reason: server.reason,
          scope: server.matching_scope,
        });
        compared += 1;
      }
    }
    expect(compared).toBe(5 * 16);
  });

  it('agrees for the sample organization seeded the same way as the server database', () => {
    const seed = createSeedState();
    const sample = policyFromSample(seed.roles, seed.users);
    for (const member of sample.members) {
      for (const permission of STANDARD_PERMISSIONS) {
        const server = serverDecision(sample, member.email, permission);
        const local = checkAccess(sample, { kind: 'member', query: member.email }, { kind: 'permission', permission });
        expect([local.allowed, local.reason]).toEqual([server.allowed, server.reason]);
      }
    }
  });

  it('maps a guarded route to the permission the running gateway enforces', async () => {
    const { app } = createApp(':memory:', true);
    // A member whose role holds none of the four guarded permissions is denied everywhere.
    await request(app).put('/api/roles/viewer/permissions').send({ permissions: ['roles:read'] }).expect(200);
    const created = await request(app).post('/api/users').send({ name: 'Vera Viewer', email: 'vera@example.test', role: 'viewer' });
    const viewer = created.body.data;
    for (const route of PROTECTED_ROUTES) {
      const response = route.method === 'GET'
        ? await request(app).get(`/api${route.path}`).set('x-user-id', viewer.id)
        : await request(app).post(`/api${route.path}`).set('x-user-id', viewer.id);
      expect(response.body.evaluation.required_permission).toBe(route.permission);
    }
  });
});

describe('policy tester answers', () => {
  it('allows through a wildcard and names the role and scope', () => {
    const result = checkAccess(policy, { kind: 'member', query: 'Ben@Example.test' }, { kind: 'permission', permission: 'billing:write' });
    expect(result).toMatchObject({ answered: true, allowed: true, role: 'billing', matchingScope: 'billing:*', reason: "Authorized via role 'billing'" });
    expect(result.explanation).toContain("through the scope 'billing:*'");
    expect(result.grantedBy).toEqual([{ role: 'owner', scope: '*' }, { role: 'billing', scope: 'billing:*' }]);
  });

  it('denies and says that no scope covers the permission', () => {
    const result = checkAccess(policy, { kind: 'member', query: 'rita@example.test' }, { kind: 'permission', permission: 'deploy:execute' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Role 'reader' lacks permission 'deploy:execute'");
    expect(result.explanation).toContain('none of its 2 scopes covers');
    expect(result.grantedBy).toEqual([{ role: 'owner', scope: '*' }]);
  });

  it('denies a suspended member even when the role grants everything', () => {
    const result = checkAccess(policy, { kind: 'member', query: 'sam@example.test' }, { kind: 'permission', permission: 'users:read' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('User account has been suspended');
    expect(result.role).toBe('owner');
  });

  it('finds a member by unique name and rejects an unknown one', () => {
    expect(findMember(policy, 'olga owner')?.email).toBe('olga@example.test');
    const result = checkAccess(policy, { kind: 'member', query: 'ghost' }, { kind: 'permission', permission: 'users:read' });
    expect(result).toMatchObject({ answered: true, allowed: false, reason: 'User not found in tenant organization' });
  });

  it('checks a role directly', () => {
    const yes = checkAccess(policy, { kind: 'role', query: 'billing' }, { kind: 'permission', permission: 'billing:read' });
    expect(yes).toMatchObject({ allowed: true, matchingScope: 'billing:*', role: 'billing' });
    const no = checkAccess(policy, { kind: 'role', query: 'nobody' }, { kind: 'permission', permission: 'billing:read' });
    expect(no.allowed).toBe(false);
    expect(no.explanation).toContain("None of the 0 scopes of role 'nobody'");
    expect(checkAccess(policy, { kind: 'role', query: 'ghost' }, { kind: 'permission', permission: 'users:read' }).reason).toBe("Role 'ghost' does not exist");
  });

  it('answers a request line through the route table', () => {
    const result = checkAccess(policy, { kind: 'member', query: 'rita@example.test' }, { kind: 'route', method: 'get', path: '/api/protected/users/?x=1' });
    expect(result).toMatchObject({ answered: true, allowed: true, permission: 'users:read' });
    expect(result.route?.endpoint).toBe('users');
    const post = checkAccess(policy, { kind: 'member', query: 'rita@example.test' }, { kind: 'route', method: 'POST', path: '/protected/deploy' });
    expect(post).toMatchObject({ allowed: false, permission: 'deploy:execute' });
  });

  it('does not answer for a route the gateway does not guard or a malformed permission', () => {
    const unknown = checkAccess(policy, { kind: 'member', query: 'rita@example.test' }, { kind: 'route', method: 'GET', path: '/api/health' });
    expect(unknown.answered).toBe(false);
    expect(unknown.explanation).toContain('no permission rule for GET /api/health');
    expect(checkAccess(policy, { kind: 'member', query: 'rita@example.test' }, { kind: 'permission', permission: 'Users Read' }).answered).toBe(false);
    expect(requestedPermissionProblem('users:*')).toMatch(/concrete permission/);
    expect(requestedPermissionProblem('')).toMatch(/Enter a permission/);
    expect(requestedPermissionProblem('users:read')).toBeNull();
  });

  it('lists the roles that grant a permission', () => {
    expect(rolesGranting(policy, 'users:read').map((grant) => grant.role)).toEqual(['owner', 'billing', 'reader']);
    expect(rolesGranting(policy, 'zzz:nothing').map((grant) => grant.role)).toEqual(['owner']);
  });
});

describe('route table', () => {
  it('matches the four guarded routes and ignores a prefix, query and trailing slash', () => {
    expect(PROTECTED_ROUTES).toHaveLength(4);
    expect(findRoute('GET', '/protected/billing')?.permission).toBe('billing:read');
    expect(findRoute('post', '/api/protected/billing/invoice/')?.permission).toBe('billing:write');
    expect(findRoute('GET', '/api/protected/billing/invoice')).toBeNull();
    expect(findRoute('GET', '/api')).toBeNull();
  });
});
