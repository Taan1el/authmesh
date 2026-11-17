// The gateway's guarded routes and the permission each one requires. The
// Express router (server/src/routes/api.routes.ts), the in-browser demo
// (client/src/services/demoApi.ts) and the policy tester all read this one
// table, so a request such as "GET /api/protected/billing" maps to the same
// permission everywhere.

export const API_PREFIX = '/api';

export interface ProtectedRoute {
  /** Key the Security Sandbox uses for this route. */
  endpoint: string;
  method: 'GET' | 'POST';
  /** Path below the API prefix. */
  path: string;
  permission: string;
  resource: string;
}

export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  { endpoint: 'billing', method: 'GET', path: '/protected/billing', permission: 'billing:read', resource: 'billing' },
  { endpoint: 'billing/invoice', method: 'POST', path: '/protected/billing/invoice', permission: 'billing:write', resource: 'billing' },
  { endpoint: 'users', method: 'GET', path: '/protected/users', permission: 'users:read', resource: 'users' },
  { endpoint: 'deploy', method: 'POST', path: '/protected/deploy', permission: 'deploy:execute', resource: 'deploy' },
];

/** Looks a route up by method and path below the API prefix. Throws when the table has no such route. */
export function requireRoute(method: ProtectedRoute['method'], path: string): ProtectedRoute {
  const route = PROTECTED_ROUTES.find((item) => item.method === method && item.path === path);
  if (!route) throw new Error(`No guarded route is defined for ${method} ${path}`);
  return route;
}

export function routeByEndpoint(endpoint: string): ProtectedRoute | undefined {
  return PROTECTED_ROUTES.find((item) => item.endpoint === endpoint);
}

/**
 * Maps a request line to a guarded route. The query string, a trailing
 * slash, letter case of the method and an optional "/api" prefix are
 * ignored. Returns null when the gateway has no permission rule for it.
 */
export function findRoute(method: string, path: string): ProtectedRoute | null {
  const verb = method.trim().toUpperCase();
  let clean = path.trim().split(/[?#]/)[0];
  if (clean.length > 1) clean = clean.replace(/\/+$/, '');
  if (clean === API_PREFIX || clean.startsWith(`${API_PREFIX}/`)) clean = clean.slice(API_PREFIX.length) || '/';
  return PROTECTED_ROUTES.find((item) => item.method === verb && item.path === clean) ?? null;
}
