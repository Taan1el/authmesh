import type { AuditEvent } from './types.js';
import type { AuditHashInput } from './crypto.js';
import { GENESIS_HASH } from './crypto.js';

// Verifies an exported audit log in this app's own hash-chained format.
// Each entry stores the hash of the entry before it (prev_hash) and its own
// hash, computed from prev_hash, actor_id, action, resource, status,
// created_at and details. The hash function is passed in, so the browser
// uses the same calculateAuditHash the demo and the server use (see
// shared/crypto.ts) and the tests can use node:crypto.
//
// The chain does not cover actor_name, actor_type, ip_address or user_agent:
// changing only those is not detectable by this check, the same as on the
// server.

export const AUDIT_LOG_LIMITS = { entries: 200_000, fileBytes: 25 * 1024 * 1024 } as const;

export interface AuditLogIssue {
  path: string;
  message: string;
}

export type AuditLogParseResult =
  | { ok: true; events: AuditEvent[] }
  | { ok: false; issues: AuditLogIssue[]; truncated: boolean };

export type ChainProblemKind = 'genesis' | 'link' | 'hash';

export interface ChainProblem {
  kind: ChainProblemKind;
  /** 1-based position in time order, oldest first. */
  entryNumber: number;
  /** 0-based index in the file as given. */
  fileIndex: number;
  id: string;
  message: string;
}

export interface ChainVerification {
  valid: boolean;
  total: number;
  /** Direction the file was written in. Newest-first files are reversed before checking. */
  order: 'oldest-first' | 'newest-first';
  /** Every problem found, in time order, up to 500. */
  problems: ChainProblem[];
  firstBroken?: ChainProblem;
}

const MAX_ISSUES = 25;
const MAX_PROBLEMS = 500;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TEXT_FIELDS = ['id', 'actor_id', 'actor_name', 'action', 'resource', 'ip_address', 'user_agent', 'details'] as const;

function show(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Validates the shape of already-parsed JSON: a list of entries, or an object holding one under events or data. */
export function parseAuditLogValue(value: unknown): AuditLogParseResult {
  const issues: AuditLogIssue[] = [];
  let truncated = false;
  const add = (path: string, message: string) => {
    if (issues.length >= MAX_ISSUES) truncated = true;
    else issues.push({ path, message });
  };

  let list: unknown = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const holder = value as Record<string, unknown>;
    list = Array.isArray(holder.events) ? holder.events : Array.isArray(holder.data) ? holder.data : undefined;
  }
  if (!Array.isArray(list)) {
    return {
      ok: false,
      issues: [{ path: 'file', message: `expected a list of audit entries, or an object with them under "events", got ${show(value)}` }],
      truncated: false,
    };
  }
  if (list.length === 0) {
    return { ok: false, issues: [{ path: 'events', message: 'expected at least one entry, got an empty list' }], truncated: false };
  }
  if (list.length > AUDIT_LOG_LIMITS.entries) {
    return {
      ok: false,
      issues: [{ path: 'events', message: `expected at most ${AUDIT_LOG_LIMITS.entries} entries, got ${list.length}` }],
      truncated: false,
    };
  }

  const events: AuditEvent[] = [];
  list.forEach((item: unknown, index: number) => {
    const path = `events[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add(path, `expected an entry object, got ${show(item)}`);
      return;
    }
    const entry = item as Record<string, unknown>;
    for (const field of TEXT_FIELDS) {
      if (typeof entry[field] !== 'string') add(`${path}.${field}`, `expected text, got ${entry[field] === undefined ? 'nothing' : show(entry[field])}`);
    }
    if (entry.actor_type !== 'user' && entry.actor_type !== 'api_key' && entry.actor_type !== 'system') {
      add(`${path}.actor_type`, `expected "user", "api_key" or "system", got ${show(entry.actor_type)}`);
    }
    if (entry.status !== 'granted' && entry.status !== 'denied') {
      add(`${path}.status`, `expected "granted" or "denied", got ${show(entry.status)}`);
    }
    for (const field of ['prev_hash', 'hash'] as const) {
      if (typeof entry[field] !== 'string' || !HASH_PATTERN.test(entry[field] as string)) {
        add(`${path}.${field}`, `expected 64 lowercase hex characters, got ${show(entry[field])}`);
      }
    }
    if (typeof entry.created_at !== 'string' || Number.isNaN(Date.parse(entry.created_at))) {
      add(`${path}.created_at`, `expected a date and time such as 2026-01-01T00:00:00.000Z, got ${show(entry.created_at)}`);
    }
    events.push(entry as unknown as AuditEvent);
  });
  if (issues.length > 0) return { ok: false, issues, truncated };
  return { ok: true, events };
}

export function parseAuditLogText(text: string): AuditLogParseResult {
  if (text.length > AUDIT_LOG_LIMITS.fileBytes) {
    return {
      ok: false,
      issues: [{ path: 'file', message: `expected a file of at most ${AUDIT_LOG_LIMITS.fileBytes / (1024 * 1024)} MB` }],
      truncated: false,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unreadable text';
    return { ok: false, issues: [{ path: 'file', message: `expected JSON text; ${detail}` }], truncated: false };
  }
  return parseAuditLogValue(value);
}

function detectOrder(events: AuditEvent[]): 'oldest-first' | 'newest-first' {
  if (events.length < 2) return 'oldest-first';
  const first = events[0];
  const last = events[events.length - 1];
  if (first.prev_hash === GENESIS_HASH) return 'oldest-first';
  if (last.prev_hash === GENESIS_HASH) return 'newest-first';
  return Date.parse(first.created_at) > Date.parse(last.created_at) ? 'newest-first' : 'oldest-first';
}

export interface VerifyOptions {
  /** The log is a slice that starts after the first entry ever written, so the first entry need not point at the genesis hash. */
  excerpt?: boolean;
}

/**
 * Walks the chain from the oldest entry and records every entry whose link
 * or hash is wrong. The first one is where the chain breaks. Entries are
 * taken in the order the file gives them (reversed when the file is
 * newest-first), so a reordered file breaks at the first misplaced entry.
 */
export function verifyAuditLog(
  events: AuditEvent[],
  calculateAuditHash: (input: AuditHashInput) => string,
  options: VerifyOptions = {}
): ChainVerification {
  const order = detectOrder(events);
  const chronological = order === 'newest-first' ? [...events].reverse() : events;
  const problems: ChainProblem[] = [];
  let previousHash = GENESIS_HASH;

  chronological.forEach((entry, index) => {
    if (problems.length >= MAX_PROBLEMS) return;
    const fileIndex = order === 'newest-first' ? events.length - 1 - index : index;
    const entryNumber = index + 1;
    const record = (kind: ChainProblemKind, message: string) => problems.push({ kind, entryNumber, fileIndex, id: entry.id, message });

    if (index === 0) {
      if (!options.excerpt && entry.prev_hash !== GENESIS_HASH) {
        record('genesis', 'The first entry does not point at the genesis hash, so entries before it are missing or it was changed. If this file is a slice of a longer log, turn on "This file is an excerpt".');
      }
    } else if (entry.prev_hash !== previousHash) {
      record('link', `prev_hash does not match the hash of entry ${entryNumber - 1}. An entry was changed, removed, added or moved here.`);
    }

    const computed = calculateAuditHash({
      prev_hash: entry.prev_hash,
      actor_id: entry.actor_id,
      action: entry.action,
      resource: entry.resource,
      status: entry.status,
      created_at: entry.created_at,
      details: entry.details,
    });
    if (computed !== entry.hash) {
      record('hash', `Stored hash ${entry.hash.slice(0, 12)}... does not match the hash computed from the entry's content (${computed.slice(0, 12)}...). The entry was changed after it was written.`);
    }
    previousHash = entry.hash;
  });

  return {
    valid: problems.length === 0,
    total: events.length,
    order,
    problems,
    ...(problems.length ? { firstBroken: problems[0] } : {}),
  };
}
