export class PolicyService {
  /**
   * Matches a single scope against a requested permission.
   * Supports universal wildcard '*' and namespace wildcards (e.g., 'billing:*' matches 'billing:read').
   */
  matches(scope: string, requestedPermission: string): boolean {
    if (scope === '*') return true;
    if (scope === requestedPermission) return true;

    if (scope.endsWith(':*')) {
      const scopeNamespace = scope.split(':')[0];
      const reqNamespace = requestedPermission.split(':')[0];
      return scopeNamespace === reqNamespace;
    }

    return false;
  }

  /**
   * Checks if any granted scope in an array matches the requested permission.
   */
  hasPermission(grantedScopes: string[], requestedPermission: string): {
    allowed: boolean;
    matchingScope?: string;
  } {
    for (const scope of grantedScopes) {
      if (this.matches(scope, requestedPermission)) {
        return { allowed: true, matchingScope: scope };
      }
    }

    return { allowed: false };
  }
}
