import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { ApiKey, CreateApiKeyDto } from '../../../shared/types.js';
import { IApiKeyRepository } from '../../../shared/repositories.js';
import { generateApiKey } from '../utils/crypto.js';

export class ApiKeyRepository implements IApiKeyRepository {
  constructor(private db: DatabaseSync) {}

  listApiKeys(): ApiKey[] {
    const stmt = this.db.prepare(`
      SELECT k.*, u.name as creator_name
      FROM api_keys k
      LEFT JOIN users u ON k.created_by = u.id
      ORDER BY k.created_at DESC;
    `);
    const rows = stmt.all() as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      key_prefix: r.key_prefix,
      scopes: JSON.parse(r.scopes),
      created_by: r.created_by,
      rate_limit_rpm: Number(r.rate_limit_rpm),
      last_used_at: r.last_used_at,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
    }));
  }

  getApiKeyById(id: string): ApiKey | null {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?;');
    const r = stmt.get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      name: r.name,
      key_prefix: r.key_prefix,
      scopes: JSON.parse(r.scopes),
      created_by: r.created_by,
      rate_limit_rpm: Number(r.rate_limit_rpm),
      last_used_at: r.last_used_at,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
    };
  }

  findApiKeyByHash(keyHash: string): ApiKey | null {
    const stmt = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?;');
    const r = stmt.get(keyHash) as any;
    if (!r) return null;

    return {
      id: r.id,
      name: r.name,
      key_prefix: r.key_prefix,
      scopes: JSON.parse(r.scopes),
      created_by: r.created_by,
      rate_limit_rpm: Number(r.rate_limit_rpm),
      last_used_at: r.last_used_at,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      created_at: r.created_at,
    };
  }

  createApiKey(createdBy: string, dto: CreateApiKeyDto): ApiKey & { plaintext_token: string } {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const { token, prefix, hash } = generateApiKey();

    let expiresAt: string | null = null;
    if (dto.expires_in_days && dto.expires_in_days > 0) {
      const exp = new Date(Date.now() + dto.expires_in_days * 86400 * 1000);
      expiresAt = exp.toISOString();
    }

    const rpm = dto.rate_limit_rpm || 60;

    const stmt = this.db.prepare(`
      INSERT INTO api_keys (id, name, key_prefix, key_hash, scopes, created_by, rate_limit_rpm, last_used_at, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?);
    `);

    stmt.run(id, dto.name, prefix, hash, JSON.stringify(dto.scopes), createdBy, rpm, expiresAt, nowIso);

    const created = this.getApiKeyById(id)!;
    return {
      ...created,
      plaintext_token: token,
    };
  }

  revokeApiKey(id: string): ApiKey {
    const nowIso = new Date().toISOString();
    this.db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?;').run(nowIso, id);
    return this.getApiKeyById(id)!;
  }

  touchApiKeyLastUsed(id: string): void {
    const nowIso = new Date().toISOString();
    this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?;').run(nowIso, id);
  }
}
