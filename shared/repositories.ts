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

// AuthService and TenantService (below) depend on these interfaces instead
// of a concrete database, the same way the client's api.ts / demoApi.ts
// split works: the server's SQLite-backed repositories
// (server/src/repositories/*.ts) and the browser demo's in-memory ones
// (client/src/services/demo/*.ts) both implement these, so the exact same
// service classes run against either one.

export interface IUserRepository {
  listUsers(): User[];
  getUserById(id: string): User | null;
  getUserByEmail(email: string): User | null;
  createUser(dto: CreateUserDto): User;
  updateUserRole(id: string, role: RoleName): User;
  updateUserStatus(id: string, status: 'active' | 'suspended'): User;
}

export interface IRoleRepository {
  listRoles(): Role[];
  getRoleByName(name: RoleName): Role | null;
  updateRolePermissions(name: RoleName, permissions: string[]): Role;
}

export interface IApiKeyRepository {
  listApiKeys(): ApiKey[];
  getApiKeyById(id: string): ApiKey | null;
  findApiKeyByHash(keyHash: string): ApiKey | null;
  createApiKey(createdBy: string, dto: CreateApiKeyDto): ApiKey & { plaintext_token: string };
  revokeApiKey(id: string): ApiKey;
  touchApiKeyLastUsed(id: string): void;
}

export interface IAuditRepository {
  listAuditEvents(limit?: number): AuditEvent[];
  recordAuditEvent(data: {
    actor_type: 'user' | 'api_key' | 'system';
    actor_id: string;
    actor_name: string;
    action: string;
    resource: string;
    status: 'granted' | 'denied';
    ip_address?: string;
    user_agent?: string;
    details?: Record<string, unknown>;
  }): AuditEvent;
  verifyAuditChain(): { valid: boolean; totalBlocks: number; brokenBlockId?: string };
  getTenantMetrics(): TenantSecurityMetrics;
}
