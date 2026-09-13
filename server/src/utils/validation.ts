import { RoleName } from '../../../shared/types.js';

export const ROLE_NAMES: RoleName[] = [
  'owner',
  'admin',
  'developer',
  'security_auditor',
  'billing_manager',
  'viewer',
];

export function isValidRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && (ROLE_NAMES as string[]).includes(value);
}

// A permission is either the universal wildcard, a namespace wildcard
// (e.g. "billing:*"), or a concrete "namespace:action" pair.
const PERMISSION_PATTERN = /^(\*|[a-z]+:(\*|[a-z]+))$/;

export function isValidPermissionString(value: unknown): value is string {
  return typeof value === 'string' && PERMISSION_PATTERN.test(value);
}

export function isValidPermissionList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isValidPermissionString);
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Parses a positive integer within [1, max], falling back to `fallback`
 * when the input is missing, non-numeric, or out of range.
 */
export function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
