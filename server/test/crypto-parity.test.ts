import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createCrypto } from '../../shared/crypto.js';
import { sha256Hex as demoSha256Hex } from '../../shared/sha256.js';

// The server hashes with node:crypto and the GitHub Pages demo hashes with
// the dependency-free implementation in shared/sha256.ts (see
// server/src/utils/crypto.ts and client/src/services/demoCrypto.ts). Both
// bindings wrap the exact same shared/crypto.ts logic, so this proves they
// produce identical output for the same inputs and that data seeded by one
// (API key hashes, audit chain hashes) stays verifiable by the other.
function nodeSha256Hex(message: string): string {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

describe('server (node:crypto) and demo (shared/sha256.ts) hash bindings agree', () => {
  const serverCrypto = createCrypto(nodeSha256Hex);
  const demoCrypto = createCrypto(demoSha256Hex);

  it('produce identical raw digests for the same input', () => {
    const inputs = ['', 'a', 'am_live_deadbeef', 'the quick brown fox jumps over the lazy dog'];
    for (const input of inputs) {
      expect(demoSha256Hex(input)).toBe(nodeSha256Hex(input));
    }
  });

  it('hash API keys identically', () => {
    const token = 'am_live_8f3d9c2b1a7e6f45d0c8b3a2  ';
    expect(demoCrypto.hashApiKey(token)).toBe(serverCrypto.hashApiKey(token));
  });

  it('calculate identical audit chain hashes', () => {
    const data = {
      prev_hash: '0'.repeat(64),
      actor_id: 'user-1',
      action: 'security.access_granted',
      resource: 'billing',
      status: 'granted',
      created_at: '2026-01-01T00:00:00.000Z',
      details: '{"requested_permission":"billing:read"}',
    };
    expect(demoCrypto.calculateAuditHash(data)).toBe(serverCrypto.calculateAuditHash(data));
  });

  it('produces a hash 64 hex characters long from generateApiKey, consistent with hashApiKey', () => {
    const { token, hash } = serverCrypto.generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(demoCrypto.hashApiKey(token));
  });
});
