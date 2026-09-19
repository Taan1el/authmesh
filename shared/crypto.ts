// The SHA-256 implementation is injected by the caller, not hard-coded
// here: createCrypto(sha256Hex) binds this file's hashing and audit-chain
// logic to whichever digest function the environment provides. The
// production server binds node:crypto's createHash('sha256') (see
// server/src/utils/crypto.ts); the GitHub Pages demo, which has no
// node:crypto, binds the dependency-free implementation in shared/sha256.ts
// instead (see client/src/services/demoCrypto.ts). Both bindings hash the
// same bytes the same way, so API keys and audit entries created by one
// stay verifiable by the other.
//
// generateApiKey's randomness is unrelated to that choice: it always uses
// the Web Crypto API (globalThis.crypto.getRandomValues), which is
// available in both Node (stable since Node 19) and every browser.

// The hash chained to by the first audit block. Shared so the server's
// AuditRepository and the demo's in-memory equivalent seed and verify the
// chain against the exact same starting value.
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditHashInput {
  prev_hash: string;
  actor_id: string;
  action: string;
  resource: string;
  status: string;
  created_at: string;
  details: string;
}

export interface CryptoBinding {
  hashApiKey(rawToken: string): string;
  generateApiKey(prefix?: string): { token: string; prefix: string; hash: string };
  calculateAuditHash(data: AuditHashInput): string;
}

export function createCrypto(sha256Hex: (message: string) => string): CryptoBinding {
  function hashApiKey(rawToken: string): string {
    return sha256Hex(rawToken.trim());
  }

  function generateApiKey(prefix = 'am_live'): {
    token: string;
    prefix: string;
    hash: string;
  } {
    const randomBytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(randomBytes);
    const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const token = `${prefix}_${hex}`;
    const hash = hashApiKey(token);

    // Masked display prefix e.g. am_live_8f3d...1b4a
    const displayPrefix = `${token.slice(0, 12)}...${token.slice(-4)}`;

    return { token, prefix: displayPrefix, hash };
  }

  function calculateAuditHash(data: AuditHashInput): string {
    const payload = [
      data.prev_hash,
      data.actor_id,
      data.action,
      data.resource,
      data.status,
      data.created_at,
      data.details,
    ].join('|');

    return sha256Hex(payload);
  }

  return { hashApiKey, generateApiKey, calculateAuditHash };
}
