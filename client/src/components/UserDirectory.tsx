import React, { useState } from 'react';
import { CreateUserDto, RoleName, User } from '../../../shared/types';

interface UserDirectoryProps {
  users: User[];
  onUpdateRole: (id: string, role: RoleName) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: 'active' | 'suspended') => Promise<void>;
  onCreateUser: (dto: CreateUserDto) => Promise<void>;
}

const ROLES: { name: RoleName; label: string }[] = [
  { name: 'owner', label: 'Owner' },
  { name: 'admin', label: 'Security Admin' },
  { name: 'developer', label: 'Developer' },
  { name: 'security_auditor', label: 'Compliance Auditor' },
  { name: 'billing_manager', label: 'Billing Manager' },
  { name: 'viewer', label: 'Viewer' },
];

export const UserDirectory: React.FC<UserDirectoryProps> = ({
  users,
  onUpdateRole,
  onToggleStatus,
  onCreateUser,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleName>('developer');
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    setIsSubmitting(true);
    try {
      await onCreateUser({ name, email, role, mfa_enabled: mfaEnabled });
      setName('');
      setEmail('');
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Organization Member Identities</h3>
          <p className="subtitle">Manage roles, enforce multi-factor authentication, and govern access</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          + Invite Member
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Assigned RBAC Role</th>
              <th>MFA Security</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user-name-cell">
                    <span className="user-avatar">{u.name.slice(0, 2).toUpperCase()}</span>
                    <span className="font-semibold">{u.name}</span>
                  </div>
                </td>
                <td className="font-mono text-sm text-secondary">{u.email}</td>
                <td>
                  <select
                    className="select-mini"
                    value={u.role}
                    onChange={(e) => onUpdateRole(u.id, e.target.value as RoleName)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {u.mfa_enabled ? (
                    <span className="mfa-badge mfa-enabled">🔒 Enforced</span>
                  ) : (
                    <span className="mfa-badge mfa-disabled">⚠️ Missing</span>
                  )}
                </td>
                <td>
                  <span
                    className={`status-pill ${
                      u.status === 'active' ? 'pill-active' : 'pill-suspended'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td>
                  <button
                    className={`btn-action btn-${u.status === 'active' ? 'warning' : 'success'}`}
                    onClick={() => onToggleStatus(u.id, u.status)}
                  >
                    {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Member Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Invite Organization Member</h3>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="modal-body">
              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kaspar Kuus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-control"
                  required
                />
              </div>

              <div className="form-group">
                <label>Corporate Email</label>
                <input
                  type="email"
                  placeholder="e.g. kaspar.kuus@nordicfintech.ee"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                  required
                />
              </div>

              <div className="form-group">
                <label>Initial Role Assignment</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleName)}
                  className="form-control"
                >
                  {ROLES.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={mfaEnabled}
                    onChange={(e) => setMfaEnabled(e.target.checked)}
                  />
                  <span>Enforce Multi-Factor Authentication (MFA) on first login</span>
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Inviting...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
