import React from 'react';
import { Check } from 'lucide-react';
import { Role } from '../../../shared/types';
import { pluralize } from '../utils/pluralize.js';

interface PermissionMatrixProps {
  roles: Role[];
}

const PERMISSION_COLUMNS = [
  { key: 'users:read', label: 'Users read' },
  { key: 'users:write', label: 'Users write' },
  { key: 'roles:assign', label: 'Roles assign' },
  { key: 'keys:create', label: 'Keys create' },
  { key: 'billing:read', label: 'Billing read' },
  { key: 'billing:write', label: 'Billing write' },
  { key: 'audit:read', label: 'Audit read' },
  { key: 'deploy:execute', label: 'Deploy exec' },
];

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ roles }) => {
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
        <span className="muted">{roles.length} {pluralize(roles.length, 'role')}</span>
      </div>

      <div className="table-wrapper">
        <table className="data-table matrix-table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              {PERMISSION_COLUMNS.map((col) => (
                <th key={col.key} scope="col" className="text-center">
                  {col.label}
                </th>
              ))}
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
    </section>
  );
};
