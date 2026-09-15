import { sha256Hex } from './sha256.js';

// Uses the Web Crypto API (globalThis.crypto), which is available both in
// Node (stable since Node 19) and in every browser, so this file has no
// Node-only dependency and can run unmodified in the GitHub Pages demo.

export function hashApiKey(rawToken: string): string {
  return sha256Hex(rawToken.trim());
}

export function generateApiKey(prefix = 'am_live'): {
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

export function calculateAuditHash(data: {
  prev_hash: string;
  actor_id: string;
  action: string;
  resource: string;
  status: string;
  created_at: string;
  details: string;
}): string {
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
