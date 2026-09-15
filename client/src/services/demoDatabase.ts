import { createSeedState, DemoApiKeyRecord } from './demoSeed.js';
import { AuditEvent, Role, User } from '../../../shared/types.js';

// Namespaced so it never collides with anything else the page might store,
// and versioned so a future shape change can start clean instead of trying
// to migrate old records.
const STORAGE_KEY = 'authmesh:demo:v1';

interface PersistedShape {
  users: User[];
  roles: Role[];
  apiKeys: DemoApiKeyRecord[];
  auditLedger: AuditEvent[];
}

function isPersistedShape(value: unknown): value is PersistedShape {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.users) && Array.isArray(v.roles) && Array.isArray(v.apiKeys) && Array.isArray(v.auditLedger);
}

function loadFromStorage(): PersistedShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPersistedShape(parsed) ? parsed : null;
  } catch {
    // Corrupt or inaccessible storage (private browsing, quota, a hand-edited
    // value) - fall back to seed data instead of failing the whole page.
    return null;
  }
}

/**
 * In-browser stand-in for the server's SQLite database: the same four
 * collections (users, roles, api_keys, audit_ledger), seeded with the same
 * data (see demoSeed.ts), persisted to localStorage so a page refresh does
 * not lose data a visitor entered, the way the server's database file
 * survives a restart. demoRepositories.ts implements the shared repository
 * interfaces on top of this class the way the server's SQLite repositories
 * implement them on top of DatabaseSync.
 */
export class DemoDatabase {
  users: User[];
  roles: Role[];
  apiKeys: DemoApiKeyRecord[];
  auditLedger: AuditEvent[];

  constructor() {
    const loaded = loadFromStorage();
    if (loaded) {
      this.users = loaded.users;
      this.roles = loaded.roles;
      this.apiKeys = loaded.apiKeys;
      this.auditLedger = loaded.auditLedger;
    } else {
      const seed = createSeedState();
      this.users = seed.users;
      this.roles = seed.roles;
      this.apiKeys = seed.apiKeys;
      this.auditLedger = seed.auditLedger;
      this.persist();
    }
  }

  persist(): void {
    try {
      const shape: PersistedShape = {
        users: this.users,
        roles: this.roles,
        apiKeys: this.apiKeys,
        auditLedger: this.auditLedger,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
    } catch {
      // Best effort only; the demo still works for the rest of this session
      // if storage is unavailable or full.
    }
  }

  /** Used by the "Reset demo data" control: wipes local edits and returns to the seed scenario. */
  reset(): void {
    const seed = createSeedState();
    this.users = seed.users;
    this.roles = seed.roles;
    this.apiKeys = seed.apiKeys;
    this.auditLedger = seed.auditLedger;
    this.persist();
  }
}
