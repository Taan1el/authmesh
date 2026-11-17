import { PolicyService } from './policy.service.js';
import { decideRoleAccess, SUSPENDED_REASON, USER_NOT_FOUND_REASON } from './access-decision.js';
import { findRoute, type ProtectedRoute } from './routes.js';
import type { Policy, PolicyMember } from './policy-file.js';
import { isValidPermissionString } from './validation.js';

// "Can X do Y": answers an access question against a policy using the same
// PolicyService matching and decideRoleAccess decision the server's
// AuthService uses, so the browser tester and the gateway cannot disagree.

export type CheckSubject =
  | { kind: 'member'; query: string }
  | { kind: 'role'; query: string };

export type CheckRequest =
  | { kind: 'permission'; permission: string }
  | { kind: 'route'; method: string; path: string };

export interface RoleGrant {
  role: string;
  scope: string;
}

export interface CheckResult {
  /** False when the question could not be answered (unknown route, bad permission). */
  answered: boolean;
  allowed: boolean;
  /** The server's wording for the same decision. */
  reason: string;
  /** A fuller sentence for people reading the result. */
  explanation: string;
  permission: string;
  route?: ProtectedRoute;
  subjectLabel: string;
  role?: string;
  matchingScope?: string;
  /** Every role in the policy that grants the permission, with the scope that does. */
  grantedBy: RoleGrant[];
}

const policyService = new PolicyService();

export function findMember(policy: Policy, query: string): PolicyMember | null {
  const text = query.trim().toLowerCase();
  if (!text) return null;
  const byEmail = policy.members.find((member) => member.email.toLowerCase() === text);
  if (byEmail) return byEmail;
  const byName = policy.members.filter((member) => member.name.toLowerCase() === text);
  return byName.length === 1 ? byName[0] : null;
}

export function rolesGranting(policy: Policy, permission: string): RoleGrant[] {
  const grants: RoleGrant[] = [];
  for (const role of policy.roles) {
    const match = policyService.hasPermission(role.permissions, permission);
    if (match.allowed && match.matchingScope) grants.push({ role: role.name, scope: match.matchingScope });
  }
  return grants;
}

/** What a requested permission must look like: concrete, so no wildcard. Returns a message, or null when valid. */
export function requestedPermissionProblem(permission: string): string | null {
  const text = permission.trim();
  if (!text) return 'Enter a permission such as users:read.';
  if (text === '*' || text.endsWith(':*')) return 'Ask about one concrete permission such as users:read. Wildcards belong in role definitions.';
  if (!isValidPermissionString(text)) return 'Use the form resource:action with lowercase letters, such as users:read.';
  return null;
}

function unanswered(subjectLabel: string, permission: string, explanation: string, route?: ProtectedRoute): CheckResult {
  return { answered: false, allowed: false, reason: explanation, explanation, permission, route, subjectLabel, grantedBy: [] };
}

export function checkAccess(policy: Policy, subject: CheckSubject, request: CheckRequest): CheckResult {
  const subjectLabel = subject.query.trim();
  let permission: string;
  let route: ProtectedRoute | undefined;
  if (request.kind === 'route') {
    const found = findRoute(request.method, request.path);
    if (!found) {
      return unanswered(
        subjectLabel,
        '',
        `The gateway has no permission rule for ${request.method.trim().toUpperCase()} ${request.path.trim() || '(empty path)'}. Only the four guarded sample routes map to permissions; ask about a permission instead.`
      );
    }
    route = found;
    permission = found.permission;
  } else {
    permission = request.permission.trim();
    const problem = requestedPermissionProblem(permission);
    if (problem) return unanswered(subjectLabel, permission, problem);
  }
  const grantedBy = rolesGranting(policy, permission);
  const base = { answered: true, permission, route, subjectLabel, grantedBy };

  if (subject.kind === 'role') {
    const role = policy.roles.find((item) => item.name === subject.query.trim());
    if (!role) {
      return {
        ...base,
        allowed: false,
        reason: `Role '${subjectLabel}' does not exist`,
        explanation: `This policy defines no role named '${subjectLabel}'.`,
      };
    }
    const decision = decideRoleAccess(policyService, role.name, role.permissions, permission);
    return {
      ...base,
      allowed: decision.allowed,
      reason: decision.reason,
      explanation: decision.allowed
        ? `Role '${role.name}' grants '${permission}' through the scope '${decision.matchingScope}'.`
        : `None of the ${role.permissions.length} scopes of role '${role.name}' covers '${permission}'.`,
      role: role.name,
      matchingScope: decision.matchingScope,
    };
  }

  const member = findMember(policy, subject.query);
  if (!member) {
    return {
      ...base,
      allowed: false,
      reason: USER_NOT_FOUND_REASON,
      explanation: `No member of this policy has the email or name '${subjectLabel}'.`,
    };
  }
  const label = member.name ? `${member.name} (${member.email})` : member.email;
  if (member.status === 'suspended') {
    return {
      ...base,
      subjectLabel: label,
      allowed: false,
      reason: SUSPENDED_REASON,
      explanation: `${label} is suspended, so every request is denied whatever role it holds (${member.role}).`,
      role: member.role,
    };
  }
  const role = policy.roles.find((item) => item.name === member.role);
  // The server treats a role it cannot find as holding no scopes.
  const decision = decideRoleAccess(policyService, member.role, role?.permissions ?? [], permission);
  return {
    ...base,
    subjectLabel: label,
    allowed: decision.allowed,
    reason: decision.reason,
    explanation: decision.allowed
      ? `${label} holds role '${member.role}', which grants '${permission}' through the scope '${decision.matchingScope}'.`
      : role
        ? `${label} holds role '${member.role}', and none of its ${role.permissions.length} scopes covers '${permission}'.`
        : `${label} holds role '${member.role}', which this policy does not define.`,
    role: member.role,
    matchingScope: decision.matchingScope,
  };
}
