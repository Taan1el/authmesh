import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { User, RoleName, CreateUserDto } from '../../../shared/types.js';
import { IUserRepository } from '../../../shared/repositories.js';

export class UserRepository implements IUserRepository {
  constructor(private db: DatabaseSync) {}

  listUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC;');
    const rows = stmt.all() as any[];

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as RoleName,
      status: r.status,
      mfa_enabled: Boolean(r.mfa_enabled),
      last_login_at: r.last_login_at,
      created_at: r.created_at,
    }));
  }

  getUserById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?;');
    const r = stmt.get(id) as any;
    if (!r) return null;

    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as RoleName,
      status: r.status,
      mfa_enabled: Boolean(r.mfa_enabled),
      last_login_at: r.last_login_at,
      created_at: r.created_at,
    };
  }

  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?);');
    const r = stmt.get(email) as any;
    if (!r) return null;

    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as RoleName,
      status: r.status,
      mfa_enabled: Boolean(r.mfa_enabled),
      last_login_at: r.last_login_at,
      created_at: r.created_at,
    };
  }

  createUser(dto: CreateUserDto): User {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, name, role, status, mfa_enabled, last_login_at, created_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?);
    `);

    stmt.run(id, dto.email, dto.name, dto.role, dto.mfa_enabled ? 1 : 0, nowIso, nowIso);
    return this.getUserById(id)!;
  }

  updateUserRole(id: string, role: RoleName): User {
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?;').run(role, id);
    return this.getUserById(id)!;
  }

  updateUserStatus(id: string, status: 'active' | 'suspended'): User {
    this.db.prepare('UPDATE users SET status = ? WHERE id = ?;').run(status, id);
    return this.getUserById(id)!;
  }
}
