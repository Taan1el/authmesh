import { PolicyService } from './policy.service.js';
import { equalPolicies, type MemberStatus, type Policy, type PolicyMember, type PolicyRole } from './policy-file.js';
import { STANDARD_PERMISSIONS } from './validation.js';

// What changed between two versions of a policy: roles added, removed or
// edited (with the exact scopes added and removed), members added, removed
// or moved, and, per member, which concrete permissions they gain or lose.
//
// Wildcard scopes cover permissions nobody wrote down, so the per-member
// part is computed over a fixed set of known permissions: the standard
// ones plus every concrete permission named by a role in either version.
// The result says how many it checked.

const policyService = new PolicyService();

export interface RoleChange {
  name: string;
  added: string[];
  removed: string[];
  descriptionFrom?: string;
  descriptionTo?: string;
}

export interface MemberChange {
  email: string;
  roleFrom: string;
  roleTo: string;
  statusFrom: MemberStatus;
  statusTo: MemberStatus;
}

export interface MemberAccessChange {
  email: string;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  gained: string[];
  lost: string[];
}

export interface PolicyDiff {
  empty: boolean;
  tenant?: { from: string; to: string };
  rolesAdded: PolicyRole[];
  rolesRemoved: PolicyRole[];
  rolesChanged: RoleChange[];
  membersAdded: PolicyMember[];
  membersRemoved: PolicyMember[];
  membersChanged: MemberChange[];
  /** Members whose concrete permissions differ, in email order. */
  access: MemberAccessChange[];
  knownPermissions: number;
}

function sortedDifference(a: string[], b: string[]): string[] {
  const other = new Set(b);
  return a.filter((item) => !other.has(item)).sort();
}

/** Concrete permissions a member holds in a policy: none when suspended or when the role is not defined. */
function heldPermissions(policy: Policy, member: PolicyMember, universe: string[]): Set<string> {
  if (member.status === 'suspended') return new Set();
  const role = policy.roles.find((item) => item.name === member.role);
  if (!role) return new Set();
  return new Set(universe.filter((permission) => policyService.hasPermission(role.permissions, permission).allowed));
}

function byEmail(policy: Policy): Map<string, PolicyMember> {
  return new Map(policy.members.map((member) => [member.email.toLowerCase(), member]));
}

export function diffPolicies(before: Policy, after: Policy): PolicyDiff {
  const universe = new Set<string>(STANDARD_PERMISSIONS);
  for (const policy of [before, after]) {
    for (const role of policy.roles) {
      for (const permission of role.permissions) {
        if (permission !== '*' && !permission.endsWith(':*')) universe.add(permission);
      }
    }
  }
  const known = [...universe].sort();

  const beforeRoles = new Map(before.roles.map((role) => [role.name, role]));
  const afterRoles = new Map(after.roles.map((role) => [role.name, role]));
  const rolesAdded = after.roles.filter((role) => !beforeRoles.has(role.name));
  const rolesRemoved = before.roles.filter((role) => !afterRoles.has(role.name));
  const rolesChanged: RoleChange[] = [];
  for (const role of after.roles) {
    const previous = beforeRoles.get(role.name);
    if (!previous) continue;
    const added = sortedDifference(role.permissions, previous.permissions);
    const removed = sortedDifference(previous.permissions, role.permissions);
    const descriptionChanged = previous.description !== role.description;
    if (added.length || removed.length || descriptionChanged) {
      rolesChanged.push({
        name: role.name,
        added,
        removed,
        ...(descriptionChanged ? { descriptionFrom: previous.description, descriptionTo: role.description } : {}),
      });
    }
  }

  const beforeMembers = byEmail(before);
  const afterMembers = byEmail(after);
  const membersAdded = after.members.filter((member) => !beforeMembers.has(member.email.toLowerCase()));
  const membersRemoved = before.members.filter((member) => !afterMembers.has(member.email.toLowerCase()));
  const membersChanged: MemberChange[] = [];
  const access: MemberAccessChange[] = [];
  for (const member of after.members) {
    const previous = beforeMembers.get(member.email.toLowerCase());
    const nowHeld = heldPermissions(after, member, known);
    if (!previous) {
      access.push({ email: member.email, name: member.name, kind: 'added', gained: [...nowHeld], lost: [] });
      continue;
    }
    if (previous.role !== member.role || previous.status !== member.status) {
      membersChanged.push({
        email: member.email,
        roleFrom: previous.role,
        roleTo: member.role,
        statusFrom: previous.status,
        statusTo: member.status,
      });
    }
    const wasHeld = heldPermissions(before, previous, known);
    const gained = [...nowHeld].filter((permission) => !wasHeld.has(permission));
    const lost = [...wasHeld].filter((permission) => !nowHeld.has(permission));
    if (gained.length || lost.length) access.push({ email: member.email, name: member.name, kind: 'changed', gained, lost });
  }
  for (const member of membersRemoved) {
    const lost = [...heldPermissions(before, member, known)];
    access.push({ email: member.email, name: member.name, kind: 'removed', gained: [], lost });
  }
  access.sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));

  const tenant = before.tenant !== after.tenant ? { from: before.tenant, to: after.tenant } : undefined;
  const empty = equalPolicies(before, after);
  return {
    empty,
    ...(tenant ? { tenant } : {}),
    rolesAdded,
    rolesRemoved,
    rolesChanged,
    membersAdded,
    membersRemoved,
    membersChanged,
    access,
    knownPermissions: known.length,
  };
}

function code(text: string): string {
  // A code span cannot hold a backtick, so swap it for a plain quote.
  return `\`${text.replace(/`/g, "'").replace(/\r?\n/g, ' ')}\``;
}

function plain(text: string): string {
  return text.replace(/[\\`*_{}[\]<>|#]/g, '\\$&').replace(/\r?\n/g, ' ');
}

function list(items: string[]): string {
  return items.length ? items.map(code).join(', ') : 'none';
}

export interface MarkdownLabels {
  before: string;
  after: string;
}

/** A change review in Markdown: what changed in roles and members, and who gains or loses which permission. */
export function diffToMarkdown(diff: PolicyDiff, labels: MarkdownLabels): string {
  const lines: string[] = [];
  lines.push('# Access policy change review', '');
  lines.push(`- Before: ${plain(labels.before)}`);
  lines.push(`- After: ${plain(labels.after)}`);
  lines.push('');
  if (diff.empty) {
    lines.push('No differences. Both versions grant the same access to the same members.', '');
    return `${lines.join('\n').trimEnd()}\n`;
  }
  lines.push(
    `Summary: ${diff.rolesAdded.length} roles added, ${diff.rolesRemoved.length} removed, ${diff.rolesChanged.length} changed; ` +
      `${diff.membersAdded.length} members added, ${diff.membersRemoved.length} removed, ${diff.membersChanged.length} moved or suspended; ` +
      `${diff.access.length} members with different permissions.`,
    ''
  );
  if (diff.tenant) lines.push(`Tenant label changed from ${code(diff.tenant.from || '(none)')} to ${code(diff.tenant.to || '(none)')}.`, '');

  lines.push('## Roles', '');
  if (!diff.rolesAdded.length && !diff.rolesRemoved.length && !diff.rolesChanged.length) lines.push('No role changes.', '');
  for (const role of diff.rolesAdded) lines.push(`- Added role ${code(role.name)} with scopes: ${list(role.permissions)}`);
  for (const role of diff.rolesRemoved) lines.push(`- Removed role ${code(role.name)} (had scopes: ${list(role.permissions)})`);
  for (const role of diff.rolesChanged) {
    lines.push(`- Changed role ${code(role.name)}`);
    if (role.added.length) lines.push(`  - Scopes added: ${list(role.added)}`);
    if (role.removed.length) lines.push(`  - Scopes removed: ${list(role.removed)}`);
    if (role.descriptionFrom !== undefined) lines.push('  - Description changed');
  }
  lines.push('');

  lines.push('## Members', '');
  if (!diff.membersAdded.length && !diff.membersRemoved.length && !diff.membersChanged.length) lines.push('No member changes.', '');
  for (const member of diff.membersAdded) lines.push(`- Added ${plain(member.email)} as ${code(member.role)} (${member.status})`);
  for (const member of diff.membersRemoved) lines.push(`- Removed ${plain(member.email)} (was ${code(member.role)}, ${member.status})`);
  for (const member of diff.membersChanged) {
    const parts: string[] = [];
    if (member.roleFrom !== member.roleTo) parts.push(`role ${code(member.roleFrom)} to ${code(member.roleTo)}`);
    if (member.statusFrom !== member.statusTo) parts.push(`status ${member.statusFrom} to ${member.statusTo}`);
    lines.push(`- Changed ${plain(member.email)}: ${parts.join(', ')}`);
  }
  lines.push('');

  lines.push('## Who gains or loses access', '');
  lines.push(`Checked against ${diff.knownPermissions} known permissions (the standard set plus every concrete permission named by a role in either version).`, '');
  if (!diff.access.length) lines.push('No member gains or loses a permission.', '');
  for (const change of diff.access) {
    const heading = change.kind === 'added' ? ' (new member)' : change.kind === 'removed' ? ' (removed member)' : '';
    lines.push(`- ${plain(change.email)}${heading}`);
    if (change.gained.length) lines.push(`  - Gains: ${list(change.gained)}`);
    if (change.lost.length) lines.push(`  - Loses: ${list(change.lost)}`);
  }
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}
