import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { MemberStatus, Policy } from '../../../shared/policy-file';
import { pluralize } from '../utils/pluralize.js';

interface PolicyMembersProps {
  policy: Policy;
  onAdd: () => void;
  onChangeRole: (email: string, role: string) => void;
  onChangeStatus: (email: string, status: MemberStatus) => void;
  onRemove: (email: string) => void;
}

/** The members of a workspace policy: who holds which role, and who is suspended. */
export const PolicyMembers: React.FC<PolicyMembersProps> = ({ policy, onAdd, onChangeRole, onChangeStatus, onRemove }) => (
  <section className="panel" aria-labelledby="members-title">
    <div className="panel-heading">
      <div>
        <h2 id="members-title">Members</h2>
        <p className="panel-description">Who holds which role in this policy. A suspended member is denied everything.</p>
      </div>
      <div className="panel-heading-meta">
        <span className="muted">{policy.members.length} {pluralize(policy.members.length, 'member')}</span>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} aria-hidden="true" />
          Add member
        </button>
      </div>
    </div>

    <div className="table-wrapper" role="region" tabIndex={0} aria-label="Members table">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {policy.members.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>No members yet. Add one to test what they can do.</td>
            </tr>
          ) : (
            policy.members.map((member) => (
              <tr key={member.email}>
                <td><strong>{member.name || 'Unnamed'}</strong></td>
                <td className="cell-mono">{member.email}</td>
                <td>
                  <select
                    className="form-control"
                    value={member.role}
                    aria-label={`Role for ${member.email}`}
                    onChange={(e) => onChangeRole(member.email, e.target.value)}
                  >
                    {policy.roles.map((role) => <option key={role.name} value={role.name}>{role.name}</option>)}
                  </select>
                </td>
                <td>
                  <span className={`status-pill ${member.status}`}>{member.status === 'active' ? 'Active' : 'Suspended'}</span>
                </td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => onChangeStatus(member.email, member.status === 'active' ? 'suspended' : 'active')}
                    aria-label={`${member.status === 'active' ? 'Suspend' : 'Reactivate'} ${member.email}`}
                  >
                    {member.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                  <button type="button" className="btn-action danger" onClick={() => onRemove(member.email)} aria-label={`Remove ${member.email}`}>
                    <Trash2 size={14} aria-hidden="true" />&nbsp;Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);
