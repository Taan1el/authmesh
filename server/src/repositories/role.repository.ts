import { DatabaseSync } from 'node:sqlite';
import { Role, RoleName } from '../../../shared/types.js';

export class RoleRepository {
  constructor(private db: DatabaseSync) {}

  listRoles(): Role[] {
    const stmt = this.db.prepare('SELECT * FROM roles ORDER BY is_system DESC, name ASC;');
    const rows = stmt.all() as any[];

    return rows.map((r) => ({
      name: r.name as RoleName,
      display_name: r.display_name,
      description: r.description,
      permissions: JSON.parse(r.permissions),
      is_system: Boolean(r.is_system),
    }));
  }

  getRoleByName(name: RoleName): Role | null {
    const stmt = this.db.prepare('SELECT * FROM roles WHERE name = ?;');
    const r = stmt.get(name) as any;
    if (!r) return null;

    return {
      name: r.name as RoleName,
      display_name: r.display_name,
      description: r.description,
      permissions: JSON.parse(r.permissions),
      is_system: Boolean(r.is_system),
    };
  }

  updateRolePermissions(name: RoleName, permissions: string[]): Role {
    this.db
      .prepare('UPDATE roles SET permissions = ? WHERE name = ?;')
      .run(JSON.stringify(permissions), name);

    return this.getRoleByName(name)!;
  }
}
