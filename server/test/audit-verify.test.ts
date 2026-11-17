import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createCrypto, GENESIS_HASH } from '../../shared/crypto.js';
import { sha256Hex } from '../../shared/sha256.js';
import { parseAuditLogText, parseAuditLogValue, verifyAuditLog } from '../../shared/audit-verify.js';
import type { AuditEvent } from '../../shared/types.js';
import { createSeedState } from '../../client/src/services/demoSeed.js';
import { AuditRepository } from '../src/repositories/audit.repository.js';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from '../src/db/schema.js';

const { calculateAuditHash } = createCrypto(sha256Hex);
const nodeCrypto = createCrypto((message) => createHash('sha256').update(message, 'utf8').digest('hex'));

function buildLog(count: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < count; i += 1) {
    const base = {
      actor_id: `actor-${i % 3}`,
      action: i % 2 ? 'billing.access' : 'access.forbidden',
      resource: 'billing',
      status: i % 2 ? ('granted' as const) : ('denied' as const),
      created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      details: JSON.stringify({ n: i }),
    };
    const hash = calculateAuditHash({ prev_hash: prev, ...base });
    events.push({
      id: `evt-${i}`,
      actor_type: 'user',
      actor_name: `Person ${i % 3}`,
      ip_address: '127.0.0.1',
      user_agent: 'test',
      prev_hash: prev,
      hash,
      ...base,
    });
    prev = hash;
  }
  return events;
}

describe('audit log verifier', () => {
  it('accepts an intact chain, oldest first or newest first', () => {
    const log = buildLog(12);
    const forward = verifyAuditLog(log, calculateAuditHash);
    expect(forward).toMatchObject({ valid: true, total: 12, order: 'oldest-first', problems: [] });
    const backward = verifyAuditLog([...log].reverse(), calculateAuditHash);
    expect(backward).toMatchObject({ valid: true, total: 12, order: 'newest-first' });
  });

  it('accepts a single entry and an excerpt that starts mid-chain only when told', () => {
    expect(verifyAuditLog(buildLog(1), calculateAuditHash).valid).toBe(true);
    const slice = buildLog(10).slice(4);
    const strict = verifyAuditLog(slice, calculateAuditHash);
    expect(strict.valid).toBe(false);
    expect(strict.firstBroken).toMatchObject({ kind: 'genesis', entryNumber: 1, id: 'evt-4' });
    expect(verifyAuditLog(slice, calculateAuditHash, { excerpt: true }).valid).toBe(true);
  });

  it('points at the entry whose content was changed', () => {
    const log = buildLog(10);
    log[6] = { ...log[6], status: 'granted', action: 'access.forbidden' };
    const result = verifyAuditLog(log, calculateAuditHash);
    expect(result.valid).toBe(false);
    expect(result.firstBroken).toMatchObject({ kind: 'hash', entryNumber: 7, fileIndex: 6, id: 'evt-6' });
    expect(result.problems).toHaveLength(1);
  });

  it('points at the next entry when a changed entry was rehashed to hide it', () => {
    const log = buildLog(10);
    const edited = { ...log[3], details: '{"n":999}' };
    edited.hash = calculateAuditHash({ ...edited });
    log[3] = edited;
    const result = verifyAuditLog(log, calculateAuditHash);
    expect(result.firstBroken).toMatchObject({ kind: 'link', entryNumber: 5, id: 'evt-4' });
  });

  it('points at the first entry that was moved when two entries swap places', () => {
    const log = buildLog(10);
    [log[4], log[5]] = [log[5], log[4]];
    const result = verifyAuditLog(log, calculateAuditHash);
    expect(result.valid).toBe(false);
    expect(result.firstBroken).toMatchObject({ kind: 'link', entryNumber: 5, fileIndex: 4, id: 'evt-5' });
  });

  it('reports a wrong stored hash', () => {
    const log = buildLog(5);
    log[2] = { ...log[2], hash: 'f'.repeat(64) };
    const result = verifyAuditLog(log, calculateAuditHash);
    expect(result.firstBroken).toMatchObject({ kind: 'hash', entryNumber: 3 });
    expect(result.firstBroken?.message).toContain('Stored hash ffffffffffff');
    // The next entry still points at the original hash, so the link breaks there too.
    expect(result.problems.map((item) => item.kind)).toEqual(['hash', 'link']);
  });

  it('detects a removed entry and a removed first entry', () => {
    const missingMiddle = buildLog(8);
    missingMiddle.splice(3, 1);
    expect(verifyAuditLog(missingMiddle, calculateAuditHash).firstBroken).toMatchObject({ kind: 'link', entryNumber: 4, id: 'evt-4' });
    const missingFirst = buildLog(8).slice(1);
    expect(verifyAuditLog(missingFirst, calculateAuditHash).firstBroken).toMatchObject({ kind: 'genesis', entryNumber: 1 });
  });

  it('reports the file position of a broken entry in a newest-first file', () => {
    const log = buildLog(6);
    log[1] = { ...log[1], resource: 'users' };
    const result = verifyAuditLog([...log].reverse(), calculateAuditHash);
    expect(result.order).toBe('newest-first');
    expect(result.firstBroken).toMatchObject({ entryNumber: 2, fileIndex: 4, id: 'evt-1' });
  });

  it('verifies with the same result whichever SHA-256 binding computes the hashes', () => {
    const log = buildLog(20);
    log[10] = { ...log[10], action: 'changed' };
    expect(verifyAuditLog(log, nodeCrypto.calculateAuditHash)).toEqual(verifyAuditLog(log, calculateAuditHash));
  });

  it('verifies a log written by the server ledger itself', () => {
    const db = new DatabaseSync(':memory:');
    initializeSchema(db);
    const repo = new AuditRepository(db);
    for (let i = 0; i < 6; i += 1) {
      // The ledger picks the previous hash by timestamp, so give each entry its own millisecond.
      const tick = Date.now();
      while (Date.now() === tick) { /* wait for the next millisecond */ }
      repo.recordAuditEvent({
        actor_type: 'user', actor_id: 'u', actor_name: 'U', action: `a${i}`, resource: 'r', status: i % 2 ? 'granted' : 'denied', details: { i },
      });
    }
    // Insertion order, oldest first; entries written in the same millisecond share a timestamp.
    const written = db.prepare('SELECT * FROM audit_ledger ORDER BY rowid ASC;').all() as unknown as AuditEvent[];
    expect(written).toHaveLength(6);
    expect(verifyAuditLog(written, calculateAuditHash)).toMatchObject({ valid: true, total: 6, order: 'oldest-first' });
    expect(repo.listAuditEvents(100)).toHaveLength(6);
    const sample = createSeedState().auditLedger;
    expect(verifyAuditLog(sample, calculateAuditHash).valid).toBe(true);
  });
});

describe('audit log parser', () => {
  const log = buildLog(3);

  it('reads a bare list, an events object and the API response shape', () => {
    for (const value of [log, { events: log }, { success: true, data: log }]) {
      const parsed = parseAuditLogValue(value);
      expect(parsed.ok).toBe(true);
    }
  });

  it('names the path and expected value of a bad entry', () => {
    const bad = structuredClone(log) as unknown as Record<string, unknown>[];
    bad[1].hash = 'xyz';
    bad[2].status = 'maybe';
    delete bad[0].details;
    const parsed = parseAuditLogValue(bad);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const lines = parsed.issues.map((issue) => `${issue.path}: ${issue.message}`);
    expect(lines).toContain('events[0].details: expected text, got nothing');
    expect(lines).toContain('events[1].hash: expected 64 lowercase hex characters, got "xyz"');
    expect(lines).toContain('events[2].status: expected "granted" or "denied", got "maybe"');
  });

  it('rejects text that is not JSON, an empty list and a wrong top level', () => {
    expect(parseAuditLogText('nope').ok).toBe(false);
    expect(parseAuditLogValue([]).ok).toBe(false);
    const wrong = parseAuditLogValue({ nothing: 1 });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.issues[0].path).toBe('file');
  });
});
