import {
  ApiKey,
  AuditEvent,
  CreateApiKeyDto,
  CreateUserDto,
  Role,
  RoleName,
  TenantSecurityMetrics,
  User,
} from '../../../shared/types.js';
import { IApiKeyRepository, IAuditRepository, IRoleRepository, IUserRepository } from '../../../shared/repositories.js';
import { calculateAuditHash, generateApiKey, GENESIS_HASH } from './demoCrypto.js';
import { DemoDatabase } from './demoDatabase.js';
import { DemoApiKeyRecord } from './demoSeed.js';

// In-browser stand-ins for server/src/repositories/*.ts. Same interfaces
// (shared/repositories.ts), same query semantics, backed by DemoDatabase's
// in-memory arrays instead of SQL. AuthService and TenantService (both
// shared) run unmodified against these on the GitHub Pages build.

export class DemoUserRepository implements IUserRepository {
  constructor(private db: DemoDatabase) {}

  listUsers(): User[] {
    return [...this.db.users].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  getUserById(id: string): User | null {
    return this.db.users.find((u) => u.id === id) ?? null;
  }

  getUserByEmail(email: string): User | null {
    const target = email.toLowerCase();
    return this.db.users.find((u) => u.email.toLowerCase() === target) ?? null;
  }

  createUser(dto: CreateUserDto): User {
    const nowIso = new Date().toISOString();
    const user: User = {
      id: globalThis.crypto.randomUUID(),
      email: dto.email,
      name: dto.name,
      role: dto.role,
      status: 'active',
      mfa_enabled: Boolean(dto.mfa_enabled),
      last_login_at: nowIso,
      created_at: nowIso,
    };
    this.db.users.push(user);
    this.db.persist();
    return user;
  }

  updateUserRole(id: string, role: RoleName): User {
    const user = this.db.users.find((u) => u.id === id);
    if (!user) throw new Error(`Demo user ${id} not found`);
    user.role = role;
    this.db.persist();
    return user;
  }

  updateUserStatus(id: string, status: 'active' | 'suspended'): User {
    const user = this.db.users.find((u) => u.id === id);
    if (!user) throw new Error(`Demo user ${id} not found`);
    user.status = status;
    this.db.persist();
    return user;
  }
}

export class DemoRoleRepository implements IRoleRepository {
  constructor(private db: DemoDatabase) {}

  listRoles(): Role[] {
    return [...this.db.roles].sort((a, b) => {
      if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  getRoleByName(name: RoleName): Role | null {
    return this.db.roles.find((r) => r.name === name) ?? null;
  }

  updateRolePermissions(name: RoleName, permissions: string[]): Role {
    const role = this.db.roles.find((r) => r.name === name);
    if (!role) throw new Error(`Demo role ${name} not found`);
    role.permissions = permissions;
    this.db.persist();
    return role;
  }
}

// Strips key_hash before a key ever leaves the repository, the same way
// the server's SQL repositories only ever SELECT it for the lookup-by-hash
// query and never place it on a returned ApiKey.
function toPublicApiKey(record: DemoApiKeyRecord): ApiKey {
  return {
    id: record.id,
    name: record.name,
    key_prefix: record.key_prefix,
    scopes: record.scopes,
    created_by: record.created_by,
    rate_limit_rpm: record.rate_limit_rpm,
    last_used_at: record.last_used_at,
    expires_at: record.expires_at,
    revoked_at: record.revoked_at,
    created_at: record.created_at,
  };
}

export class DemoApiKeyRepository implements IApiKeyRepository {
  constructor(private db: DemoDatabase) {}

  listApiKeys(): ApiKey[] {
    return [...this.db.apiKeys]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(toPublicApiKey);
  }

  getApiKeyById(id: string): ApiKey | null {
    const record = this.db.apiKeys.find((k) => k.id === id);
    return record ? toPublicApiKey(record) : null;
  }

  findApiKeyByHash(keyHash: string): ApiKey | null {
    const record = this.db.apiKeys.find((k) => k.key_hash === keyHash);
    return record ? toPublicApiKey(record) : null;
  }

  createApiKey(createdBy: string, dto: CreateApiKeyDto): ApiKey & { plaintext_token: string } {
    const nowIso = new Date().toISOString();
    const { token, prefix, hash } = generateApiKey();

    let expiresAt: string | null = null;
    if (dto.expires_in_days && dto.expires_in_days > 0) {
      expiresAt = new Date(Date.now() + dto.expires_in_days * 86400 * 1000).toISOString();
    }

    const record: DemoApiKeyRecord = {
      id: globalThis.crypto.randomUUID(),
      name: dto.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: dto.scopes,
      created_by: createdBy,
      rate_limit_rpm: dto.rate_limit_rpm || 60,
      last_used_at: null,
      expires_at: expiresAt,
      revoked_at: null,
      created_at: nowIso,
    };

    this.db.apiKeys.push(record);
    this.db.persist();

    return { ...toPublicApiKey(record), plaintext_token: token };
  }

  revokeApiKey(id: string): ApiKey {
    const record = this.db.apiKeys.find((k) => k.id === id);
    if (!record) throw new Error(`Demo API key ${id} not found`);
    record.revoked_at = new Date().toISOString();
    this.db.persist();
    return toPublicApiKey(record);
  }

  touchApiKeyLastUsed(id: string): void {
    const record = this.db.apiKeys.find((k) => k.id === id);
    if (!record) return;
    record.last_used_at = new Date().toISOString();
    this.db.persist();
  }
}

export class DemoAuditRepository implements IAuditRepository {
  constructor(private db: DemoDatabase) {}

  listAuditEvents(limit = 100): AuditEvent[] {
    return [...this.db.auditLedger]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  private getLatestAuditHash(): string {
    if (this.db.auditLedger.length === 0) return GENESIS_HASH;
    const latest = [...this.db.auditLedger].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest.hash;
  }

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
  }): AuditEvent {
    const nowIso = new Date().toISOString();
    const prevHash = this.getLatestAuditHash();
    const detailsStr = JSON.stringify(data.details || {});

    const hash = calculateAuditHash({
      prev_hash: prevHash,
      actor_id: data.actor_id,
      action: data.action,
      resource: data.resource,
      status: data.status,
      created_at: nowIso,
      details: detailsStr,
    });

    const event: AuditEvent = {
      id: globalThis.crypto.randomUUID(),
      actor_type: data.actor_type,
      actor_id: data.actor_id,
      actor_name: data.actor_name,
      action: data.action,
      resource: data.resource,
      status: data.status,
      ip_address: data.ip_address || '127.0.0.1',
      user_agent: data.user_agent || 'AuthMesh Agent',
      details: detailsStr,
      prev_hash: prevHash,
      hash,
      created_at: nowIso,
    };

    this.db.auditLedger.push(event);
    this.db.persist();
    return event;
  }

  verifyAuditChain(): { valid: boolean; totalBlocks: number; brokenBlockId?: string } {
    const rows = [...this.db.auditLedger].sort((a, b) => a.created_at.localeCompare(b.created_at));

    let prevExpectedHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const block = rows[i];

      // Verify link to previous block
      if (i > 0 && block.prev_hash !== prevExpectedHash) {
        return { valid: false, totalBlocks: rows.length, brokenBlockId: block.id };
      }

      const computedHash = calculateAuditHash({
        prev_hash: block.prev_hash,
        actor_id: block.actor_id,
        action: block.action,
        resource: block.resource,
        status: block.status,
        created_at: block.created_at,
        details: block.details,
      });

      if (computedHash !== block.hash) {
        return { valid: false, totalBlocks: rows.length, brokenBlockId: block.id };
      }

      prevExpectedHash = block.hash;
    }

    return { valid: true, totalBlocks: rows.length };
  }

  getTenantMetrics(): TenantSecurityMetrics {
    const userCount = this.db.users.length;
    const mfaCount = this.db.users.filter((u) => u.mfa_enabled).length;
    const activeKeys = this.db.apiKeys.filter((k) => !k.revoked_at).length;

    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const deniedEvents = this.db.auditLedger.filter(
      (e) => e.status === 'denied' && new Date(e.created_at).getTime() >= oneDayAgo
    ).length;

    const chainVerification = this.verifyAuditChain();
    const mfaPct = userCount > 0 ? Math.round((mfaCount / userCount) * 100) : 100;

    let score = 75;
    if (mfaPct >= 75) score += 15;
    else if (mfaPct >= 50) score += 5;

    if (chainVerification.valid) score += 10;
    else score -= 30;

    if (deniedEvents > 10) score -= 10;

    return {
      total_users: userCount,
      active_api_keys: activeKeys,
      security_score: Math.max(0, Math.min(100, score)),
      denied_events_24h: deniedEvents,
      audit_chain_valid: chainVerification.valid,
      mfa_adoption_pct: mfaPct,
    };
  }
}
