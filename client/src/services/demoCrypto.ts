import { sha256Hex } from '../../../shared/sha256.js';
import { createCrypto, GENESIS_HASH } from '../../../shared/crypto.js';

// Binds the shared hashing and audit-chain logic (shared/crypto.ts) to
// shared/sha256.ts's dependency-free SHA-256 implementation, since the
// GitHub Pages demo runs entirely in the browser with no node:crypto. The
// production server binds the exact same shared logic to node:crypto
// instead (see server/src/utils/crypto.ts); server/test/crypto-parity.test.ts
// proves both bindings produce identical hashes for the same inputs, so
// data seeded by this demo stays verifiable against the server.
export const { hashApiKey, generateApiKey, calculateAuditHash } = createCrypto(sha256Hex);
export { GENESIS_HASH };
