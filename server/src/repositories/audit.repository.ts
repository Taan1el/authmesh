import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { AuditEvent, TenantSecurityMetrics } from '../../../shared/types.js';
import { calculateAuditHash } from '../utils/crypto.js';

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditRepository {
  constructor(private db: DatabaseSync) {}

  listAuditEvents(limit = 100): AuditEvent[] {
    const stmt = this.db.prepare('SELECT * FROM audit_ledger ORDER BY created_at DESC LIMIT ?;');
    const rows = stmt.all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      actor_type: r.actor_type,
      actor_id: r.actor_id,
      actor_name: r.actor_name,
      action: r.action,
      resource: r.resource,
      status: r.status,
      ip_address: r.ip_address,
      user_agent: r.user_agent,
      details: r.details,
      prev_hash: r.prev_hash,
      hash: r.hash,
      created_at: r.created_at,
    }));
  }

  getLatestAuditHash(): string {
    const stmt = this.db.prepare('SELECT hash FROM audit_ledger ORDER BY created_at DESC LIMIT 1;');
    const row = stmt.get() as any;
    return row?.hash || GENESIS_HASH;
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
    details?: Record<string, any>;
  }): AuditEvent {
    const id = crypto.randomUUID();
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

    const stmt = this.db.prepare(`
      INSERT INTO audit_ledger (
        id, actor_type, actor_id, actor_name, action, resource,
        status, ip_address, user_agent, details, prev_hash, hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    stmt.run(
      id,
      data.actor_type,
      data.actor_id,
      data.actor_name,
      data.action,
      data.resource,
      data.status,
      data.ip_address || '127.0.0.1',
      data.user_agent || 'AuthMesh Agent',
      detailsStr,
      prevHash,
      hash,
      nowIso
    );

    return {
      id,
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
  }

  verifyAuditChain(): { valid: boolean; totalBlocks: number; brokenBlockId?: string } {
    const stmt = this.db.prepare('SELECT * FROM audit_ledger ORDER BY created_at ASC;');
    const rows = stmt.all() as any[];

    let prevExpectedHash = GENESIS_HASH;

    for (let i = 0; i < rows.length; i++) {
      const block = rows[i];

      // Verify link to previous block
      if (i > 0 && block.prev_hash !== prevExpectedHash) {
        return { valid: false, totalBlocks: rows.length, brokenBlockId: block.id };
      }

      // Verify block hash
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
    const userCount = (this.db.prepare('SELECT COUNT(*) as c FROM users;').get() as any)?.c || 0;
    const mfaCount = (this.db.prepare('SELECT COUNT(*) as c FROM users WHERE mfa_enabled = 1;').get() as any)?.c || 0;
    const activeKeys = (
      this.db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE revoked_at IS NULL;').get() as any
    )?.c || 0;
    const deniedEvents = (
      this.db
        .prepare("SELECT COUNT(*) as c FROM audit_ledger WHERE status = 'denied' AND created_at >= datetime('now', '-1 day');")
        .get() as any
    )?.c || 0;

    const chainVerification = this.verifyAuditChain();
    const mfaPct = userCount > 0 ? Math.round((mfaCount / userCount) * 100) : 100;

    // Calculate security posture score (0 - 100)
    let score = 75;
    if (mfaPct >= 75) score += 15;
    else if (mfaPct >= 50) score += 5;

    if (chainVerification.valid) score += 10;
    else score -= 30;

    if (deniedEvents > 10) score -= 10;

    return {
      total_users: Number(userCount),
      active_api_keys: Number(activeKeys),
      security_score: Math.max(0, Math.min(100, score)),
      denied_events_24h: Number(deniedEvents),
      audit_chain_valid: chainVerification.valid,
      mfa_adoption_pct: mfaPct,
    };
  }
}
