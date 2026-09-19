import { createHash } from 'node:crypto';
import { createCrypto, GENESIS_HASH } from '../../../shared/crypto.js';

// Binds the shared hashing and audit-chain logic (shared/crypto.ts) to
// node:crypto's SHA-256, so the production server hashes API keys and
// audit entries with a vetted native implementation instead of hand-written
// JS. The GitHub Pages demo binds the exact same shared logic to
// shared/sha256.ts instead (see client/src/services/demoCrypto.ts);
// server/test/crypto-parity.test.ts proves both bindings produce identical
// hashes for the same inputs, so data seeded by the demo stays verifiable
// against the server's implementation and vice versa.
function sha256Hex(message: string): string {
  return createHash('sha256').update(message, 'utf8').digest('hex');
}

export const { hashApiKey, generateApiKey, calculateAuditHash } = createCrypto(sha256Hex);
export { GENESIS_HASH };
