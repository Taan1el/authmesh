import { describe, it, expect } from 'vitest';
import { diffPolicies, diffToMarkdown } from '../../shared/policy-diff.js';
import type { Policy } from '../../shared/policy-file.js';

const before: Policy = {
  tenant: 'Example Org',
  roles: [
    { name: 'admin', description: 'Runs it', permissions: ['users:*', 'keys:read'] },
    { name: 'reader', description: '', permissions: ['users:read'] },
    { name: 'old_role', description: '', permissions: ['audit:read'] },
  ],
  members: [
    { email: 'ada@example.test', name: 'Ada', role: 'admin', status: 'active' },
    { email: 'bo@example.test', name: 'Bo', role: 'reader', status: 'active' },
    { email: 'cy@example.test', name: 'Cy', role: 'old_role', status: 'active' },
  ],
};

const after: Policy = {
  tenant: 'Example Org',
  roles: [
    { name: 'admin', description: 'Runs it', permissions: ['users:*', 'keys:read', 'keys:create'] },
    { name: 'reader', description: '', permissions: ['users:read', 'billing:read'] },
    { name: 'auditor', description: '', permissions: ['audit:*'] },
  ],
  members: [
    { email: 'ada@example.test', name: 'Ada', role: 'admin', status: 'active' },
    { email: 'bo@example.test', name: 'Bo', role: 'reader', status: 'suspended' },
    { email: 'dee@example.test', name: 'Dee', role: 'auditor', status: 'active' },
  ],
};

describe('policy diff', () => {
  it('is empty for equal policies, whatever the order', () => {
    const reordered: Policy = { ...before, roles: [...before.roles].reverse(), members: [...before.members].reverse() };
    expect(diffPolicies(before, reordered).empty).toBe(true);
    expect(diffPolicies(before, before).access).toEqual([]);
  });

  it('lists the exact scopes added and removed from a role', () => {
    const diff = diffPolicies(before, after);
    expect(diff.rolesChanged).toEqual([
      { name: 'admin', added: ['keys:create'], removed: [] },
      { name: 'reader', added: ['billing:read'], removed: [] },
    ]);
    expect(diff.rolesAdded.map((role) => role.name)).toEqual(['auditor']);
    expect(diff.rolesRemoved.map((role) => role.name)).toEqual(['old_role']);
  });

  it('lists member changes and who gains or loses which permission', () => {
    const diff = diffPolicies(before, after);
    expect(diff.membersAdded.map((member) => member.email)).toEqual(['dee@example.test']);
    expect(diff.membersRemoved.map((member) => member.email)).toEqual(['cy@example.test']);
    expect(diff.membersChanged).toEqual([
      { email: 'bo@example.test', roleFrom: 'reader', roleTo: 'reader', statusFrom: 'active', statusTo: 'suspended' },
    ]);
    const byEmail = Object.fromEntries(diff.access.map((change) => [change.email, change]));
    expect(byEmail['ada@example.test']).toMatchObject({ kind: 'changed', gained: ['keys:create'], lost: [] });
    // Suspending a member removes everything the role granted.
    expect(byEmail['bo@example.test']).toMatchObject({ kind: 'changed', gained: [], lost: ['users:read'] });
    expect(byEmail['cy@example.test']).toMatchObject({ kind: 'removed', gained: [], lost: ['audit:read'] });
    expect(byEmail['dee@example.test']).toMatchObject({ kind: 'added', gained: ['audit:export', 'audit:read'] });
  });

  it('expands wildcards over the known permissions when a role gains one', () => {
    const wider: Policy = { ...before, roles: before.roles.map((role) => (role.name === 'reader' ? { ...role, permissions: ['*'] } : role)) };
    const diff = diffPolicies(before, wider);
    expect(diff.rolesChanged[0]).toEqual({ name: 'reader', added: ['*'], removed: ['users:read'] });
    const bo = diff.access.find((change) => change.email === 'bo@example.test');
    expect(bo?.gained).toContain('billing:write');
    expect(bo?.gained).toContain('deploy:execute');
    expect(bo?.gained).not.toContain('users:read');
    expect(diff.knownPermissions).toBeGreaterThanOrEqual(14);
  });

  it('notices a changed description and tenant label', () => {
    const edited: Policy = {
      ...before,
      tenant: 'Renamed',
      roles: before.roles.map((role) => (role.name === 'admin' ? { ...role, description: 'Runs things' } : role)),
    };
    const diff = diffPolicies(before, edited);
    expect(diff.empty).toBe(false);
    expect(diff.tenant).toEqual({ from: 'Example Org', to: 'Renamed' });
    expect(diff.rolesChanged[0]).toMatchObject({ name: 'admin', descriptionFrom: 'Runs it', descriptionTo: 'Runs things' });
    expect(diff.access).toEqual([]);
  });

  it('writes a Markdown change review', () => {
    const text = diffToMarkdown(diffPolicies(before, after), { before: 'policy-2026-01.json', after: 'Current workspace' });
    expect(text.startsWith('# Access policy change review\n')).toBe(true);
    expect(text).toContain('- Before: policy-2026-01.json');
    expect(text).toContain('- Changed role `admin`\n  - Scopes added: `keys:create`');
    expect(text).toContain('- Removed role `old_role` (had scopes: `audit:read`)');
    expect(text).toContain('- ada@example.test\n  - Gains: `keys:create`');
    expect(text).toContain('- bo@example.test\n  - Loses: `users:read`');
    expect(text).toContain('- cy@example.test (removed member)');
    expect(text).toMatch(/Checked against \d+ known permissions/);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('says so when there is nothing to review and escapes markup in names', () => {
    expect(diffToMarkdown(diffPolicies(before, before), { before: 'a', after: 'b' })).toContain('No differences.');
    const odd: Policy = { ...before, members: [{ email: 'x_*y@example.test', name: '', role: 'admin', status: 'active' }] };
    const text = diffToMarkdown(diffPolicies(before, odd), { before: '`one`', after: '<two>' });
    expect(text).toContain('x\\_\\*y@example.test');
    expect(text).toContain('- Before: \\`one\\`');
    expect(text).toContain('- After: \\<two\\>');
  });
});
