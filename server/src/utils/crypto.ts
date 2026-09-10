import crypto from 'node:crypto';

export function hashApiKey(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

export function generateApiKey(prefix = 'am_live'): {
  token: string;
  prefix: string;
  hash: string;
} {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const token = `${prefix}_${randomBytes}`;
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

  return crypto.createHash('sha256').update(payload).digest('hex');
}
