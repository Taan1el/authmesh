import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { PolicyService } from './policy.service.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { hashApiKey } from '../utils/crypto.js';
import { AccessEvaluationResult, EvaluateAccessDto } from '../../../shared/types.js';

export class AuthService {
  constructor(
    private apiKeyRepo: ApiKeyRepository,
    private userRepo: UserRepository,
    private roleRepo: RoleRepository,
    private auditRepo: AuditRepository,
    private policyService: PolicyService,
    private rateLimiter: RateLimiterService
  ) {}

  evaluateAccess(
    dto: EvaluateAccessDto,
    ipAddress = '127.0.0.1',
    userAgent = 'AuthMesh Agent'
  ): AccessEvaluationResult {
    const requiredPermission = dto.permission;
    const targetResource = dto.resource;

    // Case 1: Evaluate API Key Token
    if (dto.token) {
      const keyHash = hashApiKey(dto.token);
      const apiKey = this.apiKeyRepo.findApiKeyByHash(keyHash);

      if (!apiKey) {
        this.auditRepo.recordAuditEvent({
          actor_type: 'api_key',
          actor_id: 'unknown',
          actor_name: 'Unrecognized Token',
          action: 'security.invalid_token',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { reason: 'API key hash does not exist in registry', requested_permission: requiredPermission },
        });

        return {
          allowed: false,
          reason: 'Invalid or unrecognized API key token',
          required_permission: requiredPermission,
        };
      }

      if (apiKey.revoked_at) {
        this.auditRepo.recordAuditEvent({
          actor_type: 'api_key',
          actor_id: apiKey.id,
          actor_name: apiKey.name,
          action: 'security.revoked_key_attempt',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { revoked_at: apiKey.revoked_at, requested_permission: requiredPermission },
        });

        return {
          allowed: false,
          reason: 'API key has been revoked',
          required_permission: requiredPermission,
          actor: { type: 'api_key', id: apiKey.id, name: apiKey.name },
        };
      }

      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        this.auditRepo.recordAuditEvent({
          actor_type: 'api_key',
          actor_id: apiKey.id,
          actor_name: apiKey.name,
          action: 'security.expired_key_attempt',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { expires_at: apiKey.expires_at, requested_permission: requiredPermission },
        });

        return {
          allowed: false,
          reason: 'API key has expired',
          required_permission: requiredPermission,
          actor: { type: 'api_key', id: apiKey.id, name: apiKey.name },
        };
      }

      // Check Rate Limit (Token Bucket / Sliding Window)
      const rateCheck = this.rateLimiter.checkRateLimit(apiKey.id, apiKey.rate_limit_rpm);
      if (!rateCheck.allowed) {
        this.auditRepo.recordAuditEvent({
          actor_type: 'api_key',
          actor_id: apiKey.id,
          actor_name: apiKey.name,
          action: 'rate_limit.exceeded',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { rpm_limit: apiKey.rate_limit_rpm, retry_after_seconds: rateCheck.resetSeconds },
        });

        return {
          allowed: false,
          reason: `Rate limit quota exceeded (${apiKey.rate_limit_rpm} req/min). Retry in ${rateCheck.resetSeconds}s`,
          required_permission: requiredPermission,
          actor: { type: 'api_key', id: apiKey.id, name: apiKey.name },
          rate_limit: {
            limit: rateCheck.limit,
            remaining: rateCheck.remaining,
            reset_seconds: rateCheck.resetSeconds,
          },
        };
      }

      // Check permission policy scopes
      const policy = this.policyService.hasPermission(apiKey.scopes, requiredPermission);
      if (!policy.allowed) {
        this.auditRepo.recordAuditEvent({
          actor_type: 'api_key',
          actor_id: apiKey.id,
          actor_name: apiKey.name,
          action: 'access.forbidden',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { scopes: apiKey.scopes, missing_permission: requiredPermission },
        });

        return {
          allowed: false,
          reason: `Access forbidden: Key lacks required permission '${requiredPermission}'`,
          required_permission: requiredPermission,
          actor: { type: 'api_key', id: apiKey.id, name: apiKey.name },
          rate_limit: {
            limit: rateCheck.limit,
            remaining: rateCheck.remaining,
            reset_seconds: rateCheck.resetSeconds,
          },
        };
      }

      // Granted
      this.apiKeyRepo.touchApiKeyLastUsed(apiKey.id);
      this.auditRepo.recordAuditEvent({
        actor_type: 'api_key',
        actor_id: apiKey.id,
        actor_name: apiKey.name,
        action: `${targetResource}.access`,
        resource: targetResource,
        status: 'granted',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { matched_scope: policy.matchingScope, requested_permission: requiredPermission },
      });

      return {
        allowed: true,
        reason: 'Authorized via API Key policy',
        required_permission: requiredPermission,
        matching_scope: policy.matchingScope,
        actor: { type: 'api_key', id: apiKey.id, name: apiKey.name },
        rate_limit: {
          limit: rateCheck.limit,
          remaining: rateCheck.remaining,
          reset_seconds: rateCheck.resetSeconds,
        },
      };
    }

    // Case 2: Evaluate User Identity (RBAC)
    if (dto.user_id) {
      const user = this.userRepo.getUserById(dto.user_id);
      if (!user) {
        return {
          allowed: false,
          reason: 'User not found in tenant organization',
          required_permission: requiredPermission,
        };
      }

      if (user.status === 'suspended') {
        this.auditRepo.recordAuditEvent({
          actor_type: 'user',
          actor_id: user.id,
          actor_name: user.name,
          action: 'security.suspended_user_attempt',
          resource: targetResource,
          status: 'denied',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { requested_permission: requiredPermission },
        });

        return {
          allowed: false,
          reason: 'User account has been suspended',
          required_permission: requiredPermission,
          actor: { type: 'user', id: user.id, name: user.name, role: user.role },
        };
      }

      const role = this.roleRepo.getRoleByName(user.role);
      const permissions = role?.permissions || [];
      const policy = this.policyService.hasPermission(permissions, requiredPermission);

      const status = policy.allowed ? 'granted' : 'denied';
      this.auditRepo.recordAuditEvent({
        actor_type: 'user',
        actor_id: user.id,
        actor_name: user.name,
        action: policy.allowed ? `${targetResource}.access` : 'access.forbidden',
        resource: targetResource,
        status,
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { role: user.role, matched_scope: policy.matchingScope, requested_permission: requiredPermission },
      });

      return {
        allowed: policy.allowed,
        reason: policy.allowed
          ? `Authorized via role '${user.role}'`
          : `Role '${user.role}' lacks permission '${requiredPermission}'`,
        required_permission: requiredPermission,
        matching_scope: policy.matchingScope,
        actor: { type: 'user', id: user.id, name: user.name, role: user.role },
      };
    }

    return {
      allowed: false,
      reason: 'Either token or user_id must be provided for access evaluation',
      required_permission: requiredPermission,
    };
  }
}
