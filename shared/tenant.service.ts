import { IApiKeyRepository, IAuditRepository, IRoleRepository, IUserRepository } from './repositories.js';
import {
  ApiKey,
  AuditEvent,
  CreateApiKeyDto,
  CreateUserDto,
  Role,
  RoleName,
  TenantSecurityMetrics,
  User,
} from './types.js';
import { badRequest, notFound } from './http-error.js';
import { isValidEmail, isValidRoleName, ROLE_NAMES } from './validation.js';

// Tenant administration: users, roles, API keys, and the audit ledger. Only
// depends on the repository interfaces above, so the server (SQLite
// repositories) and the GitHub Pages demo (in-memory repositories) run this
// exact class instead of two copies that could drift.
export class TenantService {
  constructor(
    private userRepo: IUserRepository,
    private roleRepo: IRoleRepository,
    private apiKeyRepo: IApiKeyRepository,
    private auditRepo: IAuditRepository
  ) {}

  listUsers(): User[] {
    return this.userRepo.listUsers();
  }

  createUser(dto: CreateUserDto, actorName = 'Admin'): User {
    if (!isValidEmail(dto.email)) {
      throw badRequest('email must be a valid email address');
    }
    if (!isValidRoleName(dto.role)) {
      throw badRequest(`role must be one of: ${ROLE_NAMES.join(', ')}`);
    }
    if (this.userRepo.getUserByEmail(dto.email)) {
      throw badRequest('a user with this email already exists');
    }

    const created = this.userRepo.createUser(dto);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: created.id,
      actor_name: actorName,
      action: 'user.created',
      resource: 'users',
      status: 'granted',
      details: { email: created.email, role: created.role },
    });
    return created;
  }

  updateUserRole(userId: string, role: RoleName, actorName = 'Admin'): User {
    if (!this.userRepo.getUserById(userId)) {
      throw notFound('User not found');
    }
    if (!isValidRoleName(role)) {
      throw badRequest(`role must be one of: ${ROLE_NAMES.join(', ')}`);
    }

    const updated = this.userRepo.updateUserRole(userId, role);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: userId,
      actor_name: actorName,
      action: 'user.role_changed',
      resource: 'users',
      status: 'granted',
      details: { updated_user: updated.name, new_role: role },
    });
    return updated;
  }

  updateUserStatus(userId: string, status: 'active' | 'suspended', actorName = 'Admin'): User {
    if (!this.userRepo.getUserById(userId)) {
      throw notFound('User not found');
    }

    const updated = this.userRepo.updateUserStatus(userId, status);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: userId,
      actor_name: actorName,
      action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
      resource: 'users',
      status: 'granted',
      details: { user_name: updated.name, status },
    });
    return updated;
  }

  listRoles(): Role[] {
    return this.roleRepo.listRoles();
  }

  updateRolePermissions(name: RoleName, permissions: string[], actorName = 'Admin'): Role {
    if (!this.roleRepo.getRoleByName(name)) {
      throw notFound('Role not found');
    }

    const updated = this.roleRepo.updateRolePermissions(name, permissions);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: name,
      actor_name: actorName,
      action: 'role.permissions_updated',
      resource: 'roles',
      status: 'granted',
      details: { role: name, permissions_count: permissions.length },
    });
    return updated;
  }

  listApiKeys(): ApiKey[] {
    return this.apiKeyRepo.listApiKeys();
  }

  createApiKey(
    createdBy: string,
    dto: CreateApiKeyDto,
    actorName = 'Admin'
  ): ApiKey & { plaintext_token: string } {
    if (!this.userRepo.getUserById(createdBy)) {
      throw badRequest('createdBy must reference an existing user');
    }

    const result = this.apiKeyRepo.createApiKey(createdBy, dto);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: createdBy,
      actor_name: actorName,
      action: 'api_key.created',
      resource: 'keys',
      status: 'granted',
      details: { key_name: result.name, scopes: result.scopes, rate_limit_rpm: result.rate_limit_rpm },
    });
    return result;
  }

  revokeApiKey(keyId: string, actorName = 'Admin'): ApiKey {
    if (!this.apiKeyRepo.getApiKeyById(keyId)) {
      throw notFound('API key not found');
    }

    const key = this.apiKeyRepo.revokeApiKey(keyId);
    this.auditRepo.recordAuditEvent({
      actor_type: 'user',
      actor_id: key.id,
      actor_name: actorName,
      action: 'api_key.revoked',
      resource: 'keys',
      status: 'granted',
      details: { key_name: key.name },
    });
    return key;
  }

  listAuditEvents(limit?: number): AuditEvent[] {
    return this.auditRepo.listAuditEvents(limit);
  }

  verifyAuditChain(): { valid: boolean; totalBlocks: number; brokenBlockId?: string } {
    return this.auditRepo.verifyAuditChain();
  }

  getTenantMetrics(): TenantSecurityMetrics {
    return this.auditRepo.getTenantMetrics();
  }
}
