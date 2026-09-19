// In-browser stand-in for services/api.ts, used on the GitHub Pages build
// (import.meta.env.VITE_DEMO_MODE === 'true') where there is no Express API
// to call. Every export here matches api.ts's shape and behavior: it runs
// the exact same AuthService and TenantService classes the server uses
// (see shared/), wired to in-memory, localStorage-backed repositories
// instead of SQLite. See services/index.ts for the switch.
import {
  AccessEvaluationResult,
  ApiKey,
  AuditEvent,
  CreateApiKeyDto,
  CreateUserDto,
  EvaluateAccessDto,
  Role,
  RoleName,
  TenantSecurityMetrics,
  User,
} from '../../../shared/types.js';
import { PolicyService } from '../../../shared/policy.service.js';
import { RateLimiterService } from '../../../shared/rate-limiter.service.js';
import { AuthService } from '../../../shared/auth.service.js';
import { TenantService } from '../../../shared/tenant.service.js';
import { DemoDatabase } from './demoDatabase.js';
import {
  DemoApiKeyRepository,
  DemoAuditRepository,
  DemoRoleRepository,
  DemoUserRepository,
} from './demoRepositories.js';
import { hashApiKey } from './demoCrypto.js';

const db = new DemoDatabase();
const userRepo = new DemoUserRepository(db);
const roleRepo = new DemoRoleRepository(db);
const apiKeyRepo = new DemoApiKeyRepository(db);
const auditRepo = new DemoAuditRepository(db);
const policyService = new PolicyService();
const rateLimiter = new RateLimiterService();
const authService = new AuthService(apiKeyRepo, userRepo, roleRepo, auditRepo, policyService, rateLimiter, hashApiKey);
const tenantService = new TenantService(userRepo, roleRepo, apiKeyRepo, auditRepo);

// Wipes local edits and starts a fresh demo scenario (also clears rate
// limit counters), the same way restarting the real server would.
export function resetDemoData(): void {
  db.reset();
  rateLimiter.reset();
}

function demoUserAgent(): string {
  return typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : 'AuthMesh Demo Browser';
}

// Mirrors the four guarded routes in server/src/routes/api.routes.ts:
// the same permission/resource pairs and the same canned success payloads,
// so the Security Sandbox behaves identically against the real API and
// this in-browser demo.
const PROTECTED_ENDPOINTS: Record<
  string,
  {
    permission: string;
    resource: string;
    respond: (actor: AccessEvaluationResult['actor']) => unknown;
  }
> = {
  billing: {
    permission: 'billing:read',
    resource: 'billing',
    respond: (actor) => ({
      success: true,
      message: 'Access granted to confidential FinTech billing records',
      actor,
      data: {
        current_plan: 'Enterprise Tier',
        monthly_mrr_eur: 14500,
        next_billing_date: '2026-10-01',
      },
    }),
  },
  'billing/invoice': {
    permission: 'billing:write',
    resource: 'billing',
    respond: (actor) => ({
      success: true,
      message: 'Invoice successfully generated and sent to SEPA billing gateway',
      actor,
    }),
  },
  users: {
    permission: 'users:read',
    resource: 'users',
    respond: (actor) => ({
      success: true,
      message: 'Access granted to internal user roster',
      actor,
    }),
  },
  deploy: {
    permission: 'deploy:execute',
    resource: 'deploy',
    respond: (actor) => ({
      success: true,
      message: 'Production Kubernetes deployment triggered successfully',
      actor,
      deployment_id: `dep-${Date.now()}`,
    }),
  },
};

export const api = {
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  },

  async getUsers(): Promise<User[]> {
    return tenantService.listUsers();
  },

  async createUser(dto: CreateUserDto): Promise<User> {
    return tenantService.createUser(dto);
  },

  async updateUserRole(id: string, role: RoleName): Promise<User> {
    return tenantService.updateUserRole(id, role);
  },

  async updateUserStatus(id: string, status: 'active' | 'suspended'): Promise<User> {
    return tenantService.updateUserStatus(id, status);
  },

  async getRoles(): Promise<Role[]> {
    return tenantService.listRoles();
  },

  async updateRolePermissions(name: RoleName, permissions: string[]): Promise<Role> {
    return tenantService.updateRolePermissions(name, permissions);
  },

  async getKeys(): Promise<ApiKey[]> {
    return tenantService.listApiKeys();
  },

  async createKey(dto: CreateApiKeyDto): Promise<ApiKey & { plaintext_token: string }> {
    // Every key needs an owning user; the UI has no logged-in-actor concept
    // of its own, so fall back to the tenant's oldest member, exactly like
    // TenantController.createKey does when no x-user-id header is sent.
    const users = tenantService.listUsers();
    const createdBy = users[0]?.id;
    if (!createdBy) {
      throw new Error('cannot create an API key before any user exists');
    }
    return tenantService.createApiKey(createdBy, dto);
  },

  async revokeKey(id: string): Promise<ApiKey> {
    return tenantService.revokeApiKey(id);
  },

  async getAudit(limit = 100): Promise<AuditEvent[]> {
    return tenantService.listAuditEvents(limit);
  },

  async verifyAuditChain(): Promise<{ valid: boolean; totalBlocks: number; brokenBlockId?: string }> {
    return tenantService.verifyAuditChain();
  },

  async getMetrics(): Promise<TenantSecurityMetrics> {
    return tenantService.getTenantMetrics();
  },

  async evaluateAccess(dto: EvaluateAccessDto): Promise<AccessEvaluationResult> {
    return authService.evaluateAccess(dto, '127.0.0.1', demoUserAgent());
  },

  // Direct sandbox simulation requests, evaluated locally instead of
  // through Express + rbac.middleware.ts, but against the same AuthService
  // decision and the same status-code rules (401 unrecognized token, 429
  // rate limited, 403 otherwise denied).
  async simulateProtectedRequest(
    endpoint: string,
    _method: 'GET' | 'POST',
    authType: 'token' | 'user',
    authValue: string
  ): Promise<{ status: number; headers: Record<string, string>; data: any }> {
    const route = PROTECTED_ENDPOINTS[endpoint];
    if (!route) {
      return {
        status: 404,
        headers: { 'x-ratelimit-limit': '-', 'x-ratelimit-remaining': '-', 'x-ratelimit-reset': '-' },
        data: { success: false, error: `Unknown protected endpoint '${endpoint}'` },
      };
    }

    const dto: EvaluateAccessDto = {
      permission: route.permission,
      resource: route.resource,
      token: authType === 'token' ? authValue : undefined,
      user_id: authType === 'user' ? authValue : undefined,
    };

    const result = authService.evaluateAccess(dto, '127.0.0.1', demoUserAgent());

    const headers: Record<string, string> = {
      'x-ratelimit-limit': result.rate_limit ? String(result.rate_limit.limit) : '-',
      'x-ratelimit-remaining': result.rate_limit ? String(result.rate_limit.remaining) : '-',
      'x-ratelimit-reset': result.rate_limit ? String(result.rate_limit.reset_seconds) : '-',
    };

    if (!result.allowed) {
      let status = 403;
      if (result.reason.includes('Rate limit quota exceeded')) {
        status = 429;
      } else if (result.reason.includes('Invalid or unrecognized API key token')) {
        status = 401;
      }
      return { status, headers, data: { success: false, error: result.reason, evaluation: result } };
    }

    return { status: 200, headers, data: route.respond(result.actor) };
  },
};
