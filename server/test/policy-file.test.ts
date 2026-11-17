import { describe, it, expect } from 'vitest';
import {
  canonicalPolicy,
  emptyPolicy,
  equalPolicies,
  formatIssue,
  parsePolicyText,
  parsePolicyValue,
  policyFromSample,
  serializePolicy,
  type Policy,
} from '../../shared/policy-file.js';
import { createSeedState } from '../../client/src/services/demoSeed.js';

const valid = {
  version: 1,
  tenant: 'Example Org',
  roles: [
    { name: 'admin', description: 'Runs the place', permissions: ['users:*', 'keys:read'] },
    { name: 'viewer', permissions: ['users:read'] },
  ],
  members: [
    { email: 'ada@example.test', name: 'Ada Example', role: 'admin' },
    { email: 'bo@example.test', role: 'viewer', status: 'suspended' },
  ],
};

function issuesOf(value: unknown): string[] {
  const result = parsePolicyValue(value);
  if (result.ok) throw new Error('expected the policy to be rejected');
  return result.issues.map(formatIssue);
}

describe('policy file parser', () => {
  it('reads a valid file and fills in defaults', () => {
    const result = parsePolicyValue(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.policy.tenant).toBe('Example Org');
    expect(result.policy.roles[1]).toEqual({ name: 'viewer', description: '', permissions: ['users:read'] });
    expect(result.policy.members[0]).toEqual({ email: 'ada@example.test', name: 'Ada Example', role: 'admin', status: 'active' });
    expect(result.policy.members[1].status).toBe('suspended');
  });

  it('round-trips through the file form', () => {
    const first = parsePolicyText(JSON.stringify(valid));
    if (!first.ok) throw new Error('expected a valid policy');
    const second = parsePolicyText(serializePolicy(first.policy));
    expect(second).toEqual(first);
    expect(serializePolicy(first.policy)).toContain('"version": 1');
  });

  it('accepts a policy with no roles and no members', () => {
    expect(parsePolicyValue({ version: 1, roles: [], members: [] }).ok).toBe(true);
  });

  it('says where a file that is not JSON fails', () => {
    const result = parsePolicyText('{ "version": 1,');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].path).toBe('file');
    expect(result.issues[0].message).toMatch(/^expected JSON text;/);
  });

  it('rejects a top level that is not an object', () => {
    expect(issuesOf([])).toEqual(['file: expected an object with version, roles and members, got []']);
  });

  it('names the path and the expected value for a wrong version', () => {
    expect(issuesOf({ ...valid, version: 2 })[0]).toContain('version: this file is version 2 but this app reads version 1');
    expect(issuesOf({ ...valid, version: '1' })[0]).toBe('version: expected 1, got "1"');
    const { version: _omitted, ...rest } = valid;
    expect(issuesOf(rest)[0]).toBe('version: required; expected 1');
  });

  it('names the path of a bad permission', () => {
    const bad = structuredClone(valid);
    bad.roles[0].permissions = ['users:*', 'Keys:Read'];
    expect(issuesOf(bad)).toEqual([
      'roles[0].permissions[1]: expected "*", "resource:*" or "resource:action" using lowercase letters only, got "Keys:Read"',
    ]);
  });

  it('rejects duplicate roles, permissions and members', () => {
    const bad = structuredClone(valid);
    bad.roles.push({ name: 'admin', permissions: ['a:b'] } as never);
    bad.roles[1].permissions = ['users:read', 'users:read'];
    bad.members.push({ email: 'ADA@example.test', role: 'viewer' } as never);
    const issues = issuesOf(bad);
    expect(issues).toContain('roles[2].name: duplicate of roles[0].name ("admin"); role names must be unique');
    expect(issues).toContain('roles[1].permissions[1]: duplicate of permissions[0] ("users:read")');
    expect(issues).toContain('members[2].email: duplicate of members[0].email ("ADA@example.test"); emails are compared without letter case');
  });

  it('requires a member role that the file defines and lists the choices', () => {
    const bad = structuredClone(valid);
    bad.members[0].role = 'ghost';
    expect(issuesOf(bad)).toEqual(['members[0].role: expected one of admin, viewer, got "ghost"']);
  });

  it('rejects unknown properties, bad names, emails and statuses', () => {
    const issues = issuesOf({
      version: 1,
      extra: true,
      roles: [{ name: 'Admin Role', permisions: [] }],
      members: [{ email: 'not-an-email', role: 'x', status: 'gone' }],
    });
    expect(issues).toContain('extra: unexpected property; expected only version, tenant, roles, members');
    expect(issues).toContain('roles[0].permisions: unexpected property; expected only name, description, permissions');
    expect(issues.some((item) => item.startsWith('roles[0].name: expected a lowercase name of 1 to 64 characters'))).toBe(true);
    expect(issues).toContain('roles[0].permissions: expected a list of permissions, got nothing');
    expect(issues).toContain('members[0].email: expected an email address such as name@example.com, got "not-an-email"');
    expect(issues).toContain('members[0].status: expected "active" or "suspended", got "gone"');
  });

  it('rejects lists of the wrong type', () => {
    expect(issuesOf({ version: 1, roles: 'none', members: {} })).toEqual([
      'roles: expected a list of roles, got "none"',
      'members: expected a list of members, got {}',
    ]);
  });

  it('stops after 25 problems and says so', () => {
    const result = parsePolicyValue({ version: 1, roles: Array.from({ length: 40 }, () => ({ name: 'BAD', permissions: [] })), members: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(25);
    expect(result.truncated).toBe(true);
  });

  it('does not treat __proto__ as data', () => {
    const result = parsePolicyText('{"version":1,"roles":[],"members":[],"__proto__":{"admin":true}}');
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe('policy helpers', () => {
  const a: Policy = {
    tenant: '',
    roles: [
      { name: 'b', description: '', permissions: ['x:y', 'a:b'] },
      { name: 'a', description: '', permissions: [] },
    ],
    members: [{ email: 'Z@example.test', name: '', role: 'a', status: 'active' }],
  };

  it('compares policies without regard to order', () => {
    const b: Policy = {
      ...a,
      roles: [{ name: 'a', description: '', permissions: [] }, { name: 'b', description: '', permissions: ['a:b', 'x:y'] }],
    };
    expect(equalPolicies(a, b)).toBe(true);
    expect(canonicalPolicy(a).roles[0].name).toBe('a');
    expect(equalPolicies(a, emptyPolicy())).toBe(false);
  });

  it('builds a valid policy from the sample organization', () => {
    const seed = createSeedState();
    const policy = policyFromSample(seed.roles, seed.users, 'Sample');
    expect(policy.roles).toHaveLength(6);
    expect(policy.members.length).toBeGreaterThan(3);
    expect(parsePolicyText(serializePolicy(policy)).ok).toBe(true);
  });
});
