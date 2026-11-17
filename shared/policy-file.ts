import type { Role, User } from './types.js';
import { isValidEmail, isValidPermissionString } from './validation.js';

// The policy file the browser policy designer reads and writes:
//
//   {
//     "version": 1,
//     "tenant": "Nordic FinTech Labs",            (optional label)
//     "roles":   [{ "name": "admin", "description": "...", "permissions": ["users:*", "keys:read"] }],
//     "members": [{ "email": "a@example.com", "name": "A", "role": "admin", "status": "active" }]
//   }
//
// It mirrors the server's own model (shared/types.d.ts): a role is a name
// plus permission scopes ("*", "billing:*" or "users:read", matched by
// shared/policy.service.ts), and a member has exactly one role and an
// active or suspended status. The server has no role inheritance, so the
// file has none either. Everything here is pure, so the browser and the
// tests use the same parser.

export const POLICY_VERSION = 1;

export const POLICY_LIMITS = {
  roles: 200,
  members: 5000,
  permissionsPerRole: 200,
  roleName: 64,
  email: 254,
  text: 300,
  label: 120,
  fileBytes: 5 * 1024 * 1024,
} as const;

export type MemberStatus = 'active' | 'suspended';

export interface PolicyRole {
  name: string;
  description: string;
  permissions: string[];
}

export interface PolicyMember {
  email: string;
  name: string;
  role: string;
  status: MemberStatus;
}

/** A policy as the app holds it: every optional field filled in. */
export interface Policy {
  tenant: string;
  roles: PolicyRole[];
  members: PolicyMember[];
}

export interface PolicyIssue {
  /** Where in the file, such as roles[1].permissions[0]. "file" means the whole file. */
  path: string;
  message: string;
}

export type PolicyParseResult =
  | { ok: true; policy: Policy }
  | { ok: false; issues: PolicyIssue[]; truncated: boolean };

const MAX_ISSUES = 25;
const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ROLE_KEYS = ['name', 'description', 'permissions'];
const MEMBER_KEYS = ['email', 'name', 'role', 'status'];
const TOP_KEYS = ['version', 'tenant', 'roles', 'members'];

export function emptyPolicy(): Policy {
  return { tenant: '', roles: [], members: [] };
}

export function formatIssue(issue: PolicyIssue): string {
  return `${issue.path}: ${issue.message}`;
}

function show(value: unknown): string {
  if (value === undefined) return 'nothing';
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Collector {
  readonly issues: PolicyIssue[] = [];
  truncated = false;

  add(path: string, message: string): void {
    if (this.issues.length >= MAX_ISSUES) {
      this.truncated = true;
      return;
    }
    this.issues.push({ path, message });
  }
}

function checkKeys(out: Collector, path: string, value: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      out.add(path === 'file' ? key : `${path}.${key}`, `unexpected property; expected only ${allowed.join(', ')}`);
    }
  }
}

function readOptionalText(out: Collector, path: string, value: unknown, max: number): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    out.add(path, `expected text, got ${show(value)}`);
    return '';
  }
  if (value.length > max) {
    out.add(path, `expected at most ${max} characters, got ${value.length}`);
    return '';
  }
  return value.trim();
}

function readRoles(out: Collector, value: unknown): PolicyRole[] {
  if (!Array.isArray(value)) {
    out.add('roles', `expected a list of roles, got ${value === undefined ? 'nothing' : show(value)}`);
    return [];
  }
  if (value.length > POLICY_LIMITS.roles) {
    out.add('roles', `expected at most ${POLICY_LIMITS.roles} roles, got ${value.length}`);
    return [];
  }
  const roles: PolicyRole[] = [];
  const seen = new Map<string, number>();
  value.forEach((item, index) => {
    const path = `roles[${index}]`;
    if (!isRecord(item)) {
      out.add(path, `expected an object with name and permissions, got ${show(item)}`);
      return;
    }
    checkKeys(out, path, item, ROLE_KEYS);
    let name = '';
    if (typeof item.name !== 'string' || item.name.length > POLICY_LIMITS.roleName || !ROLE_NAME_PATTERN.test(item.name)) {
      out.add(
        `${path}.name`,
        `expected a lowercase name of 1 to ${POLICY_LIMITS.roleName} characters using a-z, 0-9 and underscore and starting with a letter, got ${show(item.name)}`
      );
    } else {
      name = item.name;
      const first = seen.get(name);
      if (first !== undefined) out.add(`${path}.name`, `duplicate of roles[${first}].name (${show(name)}); role names must be unique`);
      else seen.set(name, index);
    }
    const description = readOptionalText(out, `${path}.description`, item.description, POLICY_LIMITS.text);
    const permissions: string[] = [];
    if (!Array.isArray(item.permissions)) {
      out.add(`${path}.permissions`, `expected a list of permissions, got ${item.permissions === undefined ? 'nothing' : show(item.permissions)}`);
    } else if (item.permissions.length > POLICY_LIMITS.permissionsPerRole) {
      out.add(`${path}.permissions`, `expected at most ${POLICY_LIMITS.permissionsPerRole} permissions, got ${item.permissions.length}`);
    } else {
      const seenPermissions = new Map<string, number>();
      item.permissions.forEach((permission: unknown, permissionIndex: number) => {
        const permissionPath = `${path}.permissions[${permissionIndex}]`;
        if (!isValidPermissionString(permission)) {
          out.add(permissionPath, `expected "*", "resource:*" or "resource:action" using lowercase letters only, got ${show(permission)}`);
          return;
        }
        const firstPermission = seenPermissions.get(permission);
        if (firstPermission !== undefined) {
          out.add(permissionPath, `duplicate of permissions[${firstPermission}] (${show(permission)})`);
          return;
        }
        seenPermissions.set(permission, permissionIndex);
        permissions.push(permission);
      });
    }
    roles.push({ name, description, permissions: permissions.sort() });
  });
  return roles;
}

function readMembers(out: Collector, value: unknown, roleNames: Set<string>): PolicyMember[] {
  if (!Array.isArray(value)) {
    out.add('members', `expected a list of members, got ${value === undefined ? 'nothing' : show(value)}`);
    return [];
  }
  if (value.length > POLICY_LIMITS.members) {
    out.add('members', `expected at most ${POLICY_LIMITS.members} members, got ${value.length}`);
    return [];
  }
  const members: PolicyMember[] = [];
  const seen = new Map<string, number>();
  const known = [...roleNames];
  const knownText = known.length === 0
    ? 'no roles are defined'
    : `expected one of ${known.slice(0, 10).join(', ')}${known.length > 10 ? ` and ${known.length - 10} more` : ''}`;
  value.forEach((item, index) => {
    const path = `members[${index}]`;
    if (!isRecord(item)) {
      out.add(path, `expected an object with email and role, got ${show(item)}`);
      return;
    }
    checkKeys(out, path, item, MEMBER_KEYS);
    let email = '';
    if (typeof item.email !== 'string' || item.email.length > POLICY_LIMITS.email || !isValidEmail(item.email)) {
      out.add(`${path}.email`, `expected an email address such as name@example.com, got ${show(item.email)}`);
    } else {
      email = item.email.trim();
      const key = email.toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) out.add(`${path}.email`, `duplicate of members[${first}].email (${show(email)}); emails are compared without letter case`);
      else seen.set(key, index);
    }
    const name = readOptionalText(out, `${path}.name`, item.name, POLICY_LIMITS.label);
    let role = '';
    if (typeof item.role !== 'string' || !roleNames.has(item.role)) {
      out.add(`${path}.role`, `${knownText}, got ${show(item.role)}`);
    } else {
      role = item.role;
    }
    let status: MemberStatus = 'active';
    if (item.status !== undefined) {
      if (item.status === 'active' || item.status === 'suspended') status = item.status;
      else out.add(`${path}.status`, `expected "active" or "suspended", got ${show(item.status)}`);
    }
    members.push({ email, name, role, status });
  });
  return members;
}

/** Validates already-parsed JSON. Reports every problem it finds, up to 25, each with its path. */
export function parsePolicyValue(value: unknown): PolicyParseResult {
  const out = new Collector();
  if (!isRecord(value)) {
    out.add('file', `expected an object with version, roles and members, got ${show(value)}`);
    return { ok: false, issues: out.issues, truncated: false };
  }
  checkKeys(out, 'file', value, TOP_KEYS);
  if (value.version === undefined) {
    out.add('version', `required; expected ${POLICY_VERSION}`);
  } else if (value.version !== POLICY_VERSION) {
    const newer = typeof value.version === 'number' && value.version > POLICY_VERSION;
    out.add(
      'version',
      newer
        ? `this file is version ${value.version} but this app reads version ${POLICY_VERSION}; export it again from the version of the app that wrote it`
        : `expected ${POLICY_VERSION}, got ${show(value.version)}`
    );
  }
  const tenant = readOptionalText(out, 'tenant', value.tenant, POLICY_LIMITS.label);
  const roles = readRoles(out, value.roles);
  const members = readMembers(out, value.members, new Set(roles.map((role) => role.name).filter(Boolean)));
  if (out.issues.length > 0) return { ok: false, issues: out.issues, truncated: out.truncated };
  return { ok: true, policy: { tenant, roles, members } };
}

/** Parses the text of a policy file. A file that is not JSON gets one issue for the whole file. */
export function parsePolicyText(text: string): PolicyParseResult {
  if (text.length > POLICY_LIMITS.fileBytes) {
    return { ok: false, issues: [{ path: 'file', message: `expected a file of at most ${POLICY_LIMITS.fileBytes / (1024 * 1024)} MB` }], truncated: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unreadable text';
    return { ok: false, issues: [{ path: 'file', message: `expected JSON text; ${detail}` }], truncated: false };
  }
  return parsePolicyValue(value);
}

/** The file form of a policy: defaults left out, permissions sorted, roles and members in their given order. */
export function policyToFile(policy: Policy): Record<string, unknown> {
  return {
    version: POLICY_VERSION,
    ...(policy.tenant ? { tenant: policy.tenant } : {}),
    roles: policy.roles.map((role) => ({
      name: role.name,
      ...(role.description ? { description: role.description } : {}),
      permissions: [...role.permissions].sort(),
    })),
    members: policy.members.map((member) => ({
      email: member.email,
      ...(member.name ? { name: member.name } : {}),
      role: member.role,
      ...(member.status === 'suspended' ? { status: member.status } : {}),
    })),
  };
}

export function serializePolicy(policy: Policy): string {
  return `${JSON.stringify(policyToFile(policy), null, 2)}\n`;
}

/** Roles sorted by name and members by email, so two policies that differ only in order compare equal. */
export function canonicalPolicy(policy: Policy): Policy {
  return {
    tenant: policy.tenant,
    roles: policy.roles
      .map((role) => ({ ...role, permissions: [...role.permissions].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    members: [...policy.members].sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase())),
  };
}

export function equalPolicies(a: Policy, b: Policy): boolean {
  return JSON.stringify(canonicalPolicy(a)) === JSON.stringify(canonicalPolicy(b));
}

/** Builds a policy from the sample organization's roles and users. */
export function policyFromSample(roles: Role[], users: User[], tenant = ''): Policy {
  return {
    tenant,
    roles: roles.map((role) => ({
      name: role.name,
      description: role.description,
      permissions: [...role.permissions].sort(),
    })),
    members: users.map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    })),
  };
}
