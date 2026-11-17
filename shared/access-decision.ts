import { PolicyService } from './policy.service.js';

// The one place that turns "this role holds these scopes" into an allow or
// deny with a reason. AuthService (server and Pages demo) calls it for every
// user request, and the policy tester in the browser calls it for every
// check, so the two can never answer differently for the same policy.

export const SUSPENDED_REASON = 'User account has been suspended';
export const USER_NOT_FOUND_REASON = 'User not found in tenant organization';

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  matchingScope?: string;
}

export function decideRoleAccess(
  policyService: PolicyService,
  roleName: string,
  scopes: string[],
  requestedPermission: string
): AccessDecision {
  const match = policyService.hasPermission(scopes, requestedPermission);
  return {
    allowed: match.allowed,
    reason: match.allowed
      ? `Authorized via role '${roleName}'`
      : `Role '${roleName}' lacks permission '${requestedPermission}'`,
    matchingScope: match.matchingScope,
  };
}
