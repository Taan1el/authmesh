import React from 'react';
import type { PolicyDiff } from '../../../shared/policy-diff';
import { pluralize } from '../utils/pluralize.js';

interface DiffReportProps {
  diff: PolicyDiff;
  /** Shorter output for a dialog: only the changed roles and the members affected. */
  compact?: boolean;
}

function Scopes({ items, kind }: { items: string[]; kind: 'add' | 'remove' }) {
  if (items.length === 0) return <span className="muted">none</span>;
  return (
    <span className="scopes-wrap">
      {items.map((item) => (
        <span key={item} className={`scope-pill diff-${kind}`}>
          <span aria-hidden="true">{kind === 'add' ? '+ ' : '− '}</span>
          <span className="sr-only">{kind === 'add' ? 'Added ' : 'Removed '}</span>
          {item}
        </span>
      ))}
    </span>
  );
}

/** Shows what changed between two policies: role scopes, members, and who gains or loses which permission. */
export const DiffReport: React.FC<DiffReportProps> = ({ diff, compact }) => {
  if (diff.empty) {
    return <p className="muted" role={compact ? undefined : 'status'}>No differences. Both versions grant the same access to the same members.</p>;
  }
  const rolesChanged = diff.rolesChanged.length + diff.rolesAdded.length + diff.rolesRemoved.length;
  const membersChanged = diff.membersAdded.length + diff.membersRemoved.length + diff.membersChanged.length;

  return (
    <div className="diff-report">
      <p className="diff-summary" role={compact ? undefined : 'status'}>
        {rolesChanged} {pluralize(rolesChanged, 'role')} changed, {membersChanged} {pluralize(membersChanged, 'member')} changed,{' '}
        {diff.access.length} {pluralize(diff.access.length, 'member')} with different permissions.
      </p>

      {diff.tenant && (
        <p>
          Tenant label changed from <code>{diff.tenant.from || '(none)'}</code> to <code>{diff.tenant.to || '(none)'}</code>.
        </p>
      )}

      {rolesChanged > 0 && (
        <section aria-label="Role changes">
          <h4>Roles</h4>
          <div className="table-wrapper" role="region" tabIndex={0} aria-label="Role changes table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Change</th>
                  <th scope="col">Scopes added</th>
                  <th scope="col">Scopes removed</th>
                </tr>
              </thead>
              <tbody>
                {diff.rolesAdded.map((role) => (
                  <tr key={`add-${role.name}`}>
                    <td className="cell-mono">{role.name}</td>
                    <td>Added</td>
                    <td><Scopes items={role.permissions} kind="add" /></td>
                    <td><span className="muted">none</span></td>
                  </tr>
                ))}
                {diff.rolesRemoved.map((role) => (
                  <tr key={`remove-${role.name}`}>
                    <td className="cell-mono">{role.name}</td>
                    <td>Removed</td>
                    <td><span className="muted">none</span></td>
                    <td><Scopes items={role.permissions} kind="remove" /></td>
                  </tr>
                ))}
                {diff.rolesChanged.map((role) => (
                  <tr key={`change-${role.name}`}>
                    <td className="cell-mono">{role.name}</td>
                    <td>{role.added.length || role.removed.length ? 'Scopes changed' : 'Description changed'}</td>
                    <td><Scopes items={role.added} kind="add" /></td>
                    <td><Scopes items={role.removed} kind="remove" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!compact && membersChanged > 0 && (
        <section aria-label="Member changes">
          <h4>Members</h4>
          <ul className="diff-list">
            {diff.membersAdded.map((member) => (
              <li key={`add-${member.email}`}>Added <strong>{member.email}</strong> as <code>{member.role}</code> ({member.status})</li>
            ))}
            {diff.membersRemoved.map((member) => (
              <li key={`remove-${member.email}`}>Removed <strong>{member.email}</strong> (was <code>{member.role}</code>, {member.status})</li>
            ))}
            {diff.membersChanged.map((member) => (
              <li key={`change-${member.email}`}>
                Changed <strong>{member.email}</strong>:
                {member.roleFrom !== member.roleTo && <> role <code>{member.roleFrom}</code> to <code>{member.roleTo}</code></>}
                {member.statusFrom !== member.statusTo && <> status {member.statusFrom} to {member.statusTo}</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Members who gain or lose access">
        <h4>Who gains or loses access</h4>
        {diff.access.length === 0 ? (
          <p className="muted">No member gains or loses a permission.</p>
        ) : (
          <div className="table-wrapper" role="region" tabIndex={0} aria-label="Access changes table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Gains</th>
                  <th scope="col">Loses</th>
                </tr>
              </thead>
              <tbody>
                {diff.access.map((change) => (
                  <tr key={change.email}>
                    <td>
                      <span className="cell-mono">{change.email}</span>
                      {change.kind !== 'changed' && <small className="muted"> ({change.kind === 'added' ? 'new member' : 'removed member'})</small>}
                    </td>
                    <td><Scopes items={change.gained} kind="add" /></td>
                    <td><Scopes items={change.lost} kind="remove" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-help">
          Checked against {diff.knownPermissions} known permissions: the standard set plus every concrete permission a role names in either version.
        </p>
      </section>
    </div>
  );
};
