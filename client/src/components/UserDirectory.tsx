import { useDialog } from '../utils/useDialog';
import React, { useRef, useState } from 'react';
import { Lock, Plus, ShieldAlert, X } from 'lucide-react';
import { CreateUserDto, RoleName, User } from '../../../shared/types';

interface UserDirectoryProps {
  users: User[];
  mfaAdoptionPct?: number;
  onUpdateRole: (id: string, role: RoleName) => Promise<void>;
  onToggleStatus: (id: string, currentStatus: 'active' | 'suspended') => Promise<void>;
  onCreateUser: (dto: CreateUserDto) => Promise<void>;
}

const ROLES: { name: RoleName; label: string }[] = [
  { name: 'owner', label: 'Owner' },
  { name: 'admin', label: 'Admin' },
  { name: 'developer', label: 'Developer' },
  { name: 'security_auditor', label: 'Auditor' },
  { name: 'billing_manager', label: 'Billing manager' },
  { name: 'viewer', label: 'Viewer' },
];

export const UserDirectory: React.FC<UserDirectoryProps> = ({
  users,
  mfaAdoptionPct,
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeModal = () => setIsModalOpen(false);
  useDialog(isModalOpen, dialogRef, closeModal, nameInputRef);

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
    <section className="panel" aria-labelledby="users-title">
      <div className="panel-heading">
        <div>
          <h2 id="users-title">Members</h2>
          <p className="panel-description">Roles, MFA enrollment and account status for this organization.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Invite member
        </button>
      </div>

      {mfaAdoptionPct !== undefined && (
        <div className="meter-line">
          <span>MFA adoption</span>
          <span className="meter" aria-hidden="true">
            <span className="meter-fill" style={{ width: `${mfaAdoptionPct}%` }} />
          </span>
          <span className="meter-value">{mfaAdoptionPct}%</span>
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">MFA</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                </td>
                <td className="cell-mono">{u.email}</td>
                <td>
                  <select
                    className="form-control"
                    aria-label={`Change role for ${u.name}`}
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
                    <span className="status-pill active">
                      <Lock size={14} aria-hidden="true" /> Enforced
                    </span>
                  ) : (
                    <span className="status-pill suspended">
                      <ShieldAlert size={14} aria-hidden="true" /> Missing
                    </span>
                  )}
                </td>
                <td>
                  <span className={`status-pill ${u.status === 'active' ? 'active' : 'suspended'}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn-action"
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="invite-modal-title">Invite member</h3>
              <button className="modal-close" onClick={closeModal} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="modal-body">
              <div className="form-group">
                <label htmlFor="invite-name-input">Full name</label>
                <input
                  id="invite-name-input"
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Kaspar Kuus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-control"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="invite-email-input">Email</label>
                <input
                  id="invite-email-input"
                  type="email"
                  placeholder="e.g. kaspar.kuus@nordicfintech.ee"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="invite-role-select">Role</label>
                <select
                  id="invite-role-select"
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
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={mfaEnabled}
                    onChange={(e) => setMfaEnabled(e.target.checked)}
                  />
                  <span>Require MFA on first login</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Inviting' : 'Send invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
