// Moved to shared/crypto.ts (built on a dependency-free SHA-256 instead of
// node:crypto) so AuthService and the API key/audit repositories hash the
// exact same way as the in-browser GitHub Pages demo. Re-exported here so
// existing server imports (repositories) do not need to change.
export { hashApiKey, generateApiKey, calculateAuditHash, GENESIS_HASH } from '../../../shared/crypto.js';
