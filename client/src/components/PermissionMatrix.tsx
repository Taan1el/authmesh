import React from 'react';
import { Role } from '../../../shared/types';

interface PermissionMatrixProps {
  roles: Role[];
}

const PERMISSION_COLUMNS = [
  { key: 'users:read', label: 'Users Read' },
  { key: 'users:write', label: 'Users Write' },
  { key: 'roles:assign', label: 'Roles Assign' },
  { key: 'keys:create', label: 'Keys Create' },
  { key: 'billing:read', label: 'Billing Read' },
  { key: 'billing:write', label: 'Billing Write' },
  { key: 'audit:read', label: 'Audit Read' },
  { key: 'deploy:execute', label: 'Deploy Exec' },
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
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Enterprise Role & Scope Access Matrix</h3>
          <p className="subtitle">Declarative policy mappings across organizational functional domains</p>
        </div>
        <span className="badge badge-info">{roles.length} System Roles</span>
      </div>

      <div className="table-responsive">
        <table className="data-table matrix-table">
          <thead>
            <tr>
              <th scope="col">Role & Responsibilities</th>
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
                    <span className="role-title">{role.display_name}</span>
                    <span className="text-muted text-xs">{role.description}</span>
                  </div>
                </td>
                {PERMISSION_COLUMNS.map((col) => {
                  const has = checkHasPermission(role.permissions, col.key);
                  const isWildcard = role.permissions.includes('*') || role.permissions.includes(`${col.key.split(':')[0]}:*`);

                  return (
                    <td key={col.key} className="text-center">
                      {has ? (
                        <span
                          className={`perm-check ${isWildcard ? 'perm-wildcard' : 'perm-direct'}`}
                          title={isWildcard ? 'Inherited via wildcard (*)' : 'Explicitly granted'}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="perm-denied">—</span>
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
        <div className="legend-item">
          <span className="perm-check perm-direct">✓</span> Direct scope
        </div>
        <div className="legend-item">
          <span className="perm-check perm-wildcard">✓</span> Wildcard inherited (e.g. <code>users:*</code> or <code>*</code>)
        </div>
        <div className="legend-item">
          <span className="perm-denied">—</span> Denied by default (Zero-trust)
        </div>
      </div>
    </div>
  );
};
