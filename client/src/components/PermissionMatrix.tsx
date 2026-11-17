import React from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { pluralize } from '../utils/pluralize.js';

export interface MatrixRole {
  name: string;
  display_name: string;
  description: string;
  permissions: string[];
}

interface PermissionMatrixProps {
  roles: MatrixRole[];
  /** Columns to show instead of the standard eight, such as the permissions a workspace policy names. */
  columns?: { key: string; label: string }[];
  /** When given, roles can be added, edited and deleted, and each row lists its scopes. */
  editing?: {
    onAdd: () => void;
    onEdit: (name: string) => void;
    onDelete: (name: string) => void;
  };
}

const STANDARD_COLUMNS = [
  { key: 'users:read', label: 'Users read' },
  { key: 'users:write', label: 'Users write' },
  { key: 'roles:assign', label: 'Roles assign' },
  { key: 'keys:create', label: 'Keys create' },
  { key: 'billing:read', label: 'Billing read' },
  { key: 'billing:write', label: 'Billing write' },
  { key: 'audit:read', label: 'Audit read' },
  { key: 'deploy:execute', label: 'Deploy exec' },
];

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ roles, columns, editing }) => {
  const PERMISSION_COLUMNS = columns ?? STANDARD_COLUMNS;
  const checkHasPermission = (rolePermissions: string[], permKey: string) => {
    if (rolePermissions.includes('*')) return true;
    if (rolePermissions.includes(permKey)) return true;

    const [ns] = permKey.split(':');
    if (rolePermissions.includes(`${ns}:*`)) return true;

    return false;
  };

  return (
    <section className="panel" aria-labelledby="matrix-title">
      <div className="panel-heading">
        <div>
          <h2 id="matrix-title">Role permissions</h2>
          <p className="panel-description">Which scopes each role grants, directly or through a wildcard.</p>
        </div>
        <div className="panel-heading-meta">
          <span className="muted">{roles.length} {pluralize(roles.length, 'role')}</span>
          {editing && (
            <button type="button" className="btn btn-primary" onClick={editing.onAdd}>
              <Plus size={16} aria-hidden="true" />
              Add role
            </button>
          )}
        </div>
      </div>

      <div className="table-wrapper" role="region" tabIndex={0} aria-label="Permissions matrix table">
        <table className="data-table matrix-table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              {editing && <th scope="col">Scopes</th>}
              {PERMISSION_COLUMNS.map((col) => (
                <th key={col.key} scope="col" className="text-center">
                  {col.label}
                </th>
              ))}
              {editing && <th scope="col">Action</th>}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.name}>
                <td>
                  <div className="role-cell">
                    <strong>{role.display_name}</strong>
                    <small>{role.description}</small>
                  </div>
                </td>
                {editing && (
                  <td>
                    {role.permissions.length === 0 ? (
                      <span className="muted">none</span>
                    ) : (
                      <span className="scopes-wrap">
                        {role.permissions.map((scope) => <span key={scope} className="scope-pill">{scope}</span>)}
                      </span>
                    )}
                  </td>
                )}
                {PERMISSION_COLUMNS.map((col) => {
                  const has = checkHasPermission(role.permissions, col.key);
                  const isWildcard = role.permissions.includes('*') || role.permissions.includes(`${col.key.split(':')[0]}:*`);

                  return (
                    <td key={col.key} className="text-center">
                      {has ? (
                        <span
                          className={`perm-mark ${isWildcard ? 'wildcard' : ''}`}
                          title={isWildcard ? 'Inherited via wildcard' : 'Explicitly granted'}
                        >
                          <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                          <span className="sr-only">{isWildcard ? 'Inherited via wildcard' : 'Explicitly granted'}</span>
                        </span>
                      ) : (
                        <span className="perm-mark denied" aria-hidden="true">
                          &ndash;
                        </span>
                      )}
                    </td>
                  );
                })}
                {editing && (
                  <td className="actions-cell">
                    <button type="button" className="btn-action" onClick={() => editing.onEdit(role.name)} aria-label={`Edit role ${role.name}`}>
                      <Pencil size={14} aria-hidden="true" />&nbsp;Edit
                    </button>
                    <button type="button" className="btn-action danger" onClick={() => editing.onDelete(role.name)} aria-label={`Delete role ${role.name}`}>
                      <Trash2 size={14} aria-hidden="true" />&nbsp;Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="matrix-legend">
        <span className="matrix-legend-item">
          <Check size={14} strokeWidth={1.75} aria-hidden="true" /> Direct scope
        </span>
        <span className="matrix-legend-item">
          <Check size={14} strokeWidth={1.75} className="tag wildcard" aria-hidden="true" /> Wildcard, e.g. <code>users:*</code> or <code>*</code>
        </span>
        <span className="matrix-legend-item">&ndash; Denied by default</span>
      </div>
      {roles.length === 0 && <p className="muted panel-foot">This policy has no roles yet.</p>}
    </section>
  );
};
