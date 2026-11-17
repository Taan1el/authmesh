import React, { useMemo, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { DiffReport } from './DiffReport';
import { diffPolicies } from '../../../shared/policy-diff';
import {
  isValidRoleNameText,
  POLICY_LIMITS,
  type MemberStatus,
  type Policy,
  type PolicyMember,
  type PolicyRole,
} from '../../../shared/policy-file';
import { isValidEmail, isValidPermissionString } from '../../../shared/validation';

/** Replaces the role with this name, or adds it when there is none. */
export function withRole(policy: Policy, role: PolicyRole): Policy {
  const exists = policy.roles.some((item) => item.name === role.name);
  return {
    ...policy,
    roles: exists ? policy.roles.map((item) => (item.name === role.name ? role : item)) : [...policy.roles, role],
  };
}

/** Splits a list typed one per line, or separated by commas or spaces. */
export function splitPermissions(text: string): string[] {
  return text.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

interface RoleDialogProps {
  policy: Policy;
  /** The role being edited, or null to add one. */
  role: PolicyRole | null;
  onSave: (role: PolicyRole) => Promise<void>;
  onClose: () => void;
}

export const RoleDialog: React.FC<RoleDialogProps> = ({ policy, role, onSave, onClose }) => {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissionText, setPermissionText] = useState(role ? role.permissions.join('\n') : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const permissionRef = useRef<HTMLTextAreaElement>(null);
  const isNew = role === null;

  const tokens = useMemo(() => splitPermissions(permissionText), [permissionText]);
  const problems = useMemo(() => {
    const found: string[] = [];
    if (isNew && name !== '') {
      if (!isValidRoleNameText(name)) {
        found.push('Name: use 1 to 64 lowercase letters, digits or underscores, starting with a letter.');
      } else if (policy.roles.some((item) => item.name === name)) {
        found.push(`Name: a role named ${name} already exists.`);
      }
    }
    const seen = new Set<string>();
    for (const token of tokens) {
      if (!isValidPermissionString(token)) found.push(`Permissions: "${token}" is not valid. Use *, resource:* or resource:action in lowercase letters.`);
      else if (seen.has(token)) found.push(`Permissions: "${token}" is listed twice.`);
      seen.add(token);
    }
    if (tokens.length > POLICY_LIMITS.permissionsPerRole) found.push(`Permissions: at most ${POLICY_LIMITS.permissionsPerRole} per role.`);
    if (description.length > POLICY_LIMITS.text) found.push(`Description: at most ${POLICY_LIMITS.text} characters.`);
    return found;
  }, [isNew, name, tokens, description, policy.roles]);

  const candidate = useMemo<PolicyRole>(
    () => ({ name: role?.name ?? name, description: description.trim(), permissions: [...new Set(tokens)].sort() }),
    [role, name, description, tokens]
  );
  const diff = useMemo(
    () => (problems.length === 0 ? diffPolicies(policy, withRole(policy, candidate)) : null),
    [policy, problems.length, candidate]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length > 0) return;
    setSaving(true);
    setError('');
    try {
      await onSave(candidate);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The role could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={isNew ? 'Add role' : `Edit role ${role.name}`} onClose={onClose} initialFocusRef={isNew ? firstRef : permissionRef} wide>
      <form onSubmit={submit} className="dialog-form">
        <div className="form-group">
          <label htmlFor="role-name-input">Name</label>
          <input
            id="role-name-input"
            ref={firstRef}
            className="form-control cell-mono"
            value={name}
            readOnly={!isNew}
            onChange={(e) => setName(e.target.value)}
            aria-describedby="role-name-help"
            spellCheck={false}
            autoComplete="off"
          />
          <span id="role-name-help" className="field-help">
            {isNew ? 'Lowercase letters, digits and underscores, such as billing_manager.' : 'A role name cannot be changed. Add a new role and move members to it.'}
          </span>
        </div>
        <div className="form-group">
          <label htmlFor="role-description-input">Description</label>
          <input id="role-description-input" className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
        </div>
        <div className="form-group">
          <label htmlFor="role-permissions-input">Permissions</label>
          <textarea
            id="role-permissions-input"
            ref={permissionRef}
            className="form-control permissions-input cell-mono"
            rows={6}
            value={permissionText}
            onChange={(e) => setPermissionText(e.target.value)}
            aria-describedby="role-permissions-help"
            spellCheck={false}
          />
          <span id="role-permissions-help" className="field-help">
            One per line. <code>*</code> grants everything, <code>billing:*</code> grants every billing action, <code>users:read</code> grants one.
          </span>
        </div>

        {problems.length > 0 && (
          <div role="alert">
            <ul className="problem-list">
              {problems.slice(0, 8).map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          </div>
        )}
        {error && <p role="alert" className="is-bad">{error}</p>}

        <section aria-label="What this change does" className="dialog-preview">
          <h4>What this change does</h4>
          {diff ? <DiffReport diff={diff} compact /> : <p className="muted">Fix the problems above to see the effect on members.</p>}
        </section>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={problems.length > 0 || saving || (isNew && !name)}>
            {saving ? 'Saving' : isNew ? 'Add role' : 'Save role'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

interface MemberDialogProps {
  policy: Policy;
  onSave: (member: PolicyMember) => Promise<void>;
  onClose: () => void;
}

export const MemberDialog: React.FC<MemberDialogProps> = ({ policy, onSave, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(policy.roles[0]?.name ?? '');
  const [status, setStatus] = useState<MemberStatus>('active');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const trimmed = email.trim();
  let emailProblem = '';
  if (!isValidEmail(trimmed) || trimmed.length > POLICY_LIMITS.email) emailProblem = 'Enter an email address such as name@example.com.';
  else if (policy.members.some((member) => member.email.toLowerCase() === trimmed.toLowerCase())) emailProblem = 'A member with this email already exists.';
  const roleProblem = role ? '' : 'Add a role first, then add members.';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailProblem || roleProblem) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ email: trimmed, name: name.trim(), role, status });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The member could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title="Add member" onClose={onClose} initialFocusRef={emailRef}>
      <form onSubmit={submit} className="dialog-form" noValidate>
        <div className="form-group">
          <label htmlFor="member-email-input">Email</label>
          <input
            id="member-email-input"
            ref={emailRef}
            type="email"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={touched && Boolean(emailProblem)}
            aria-describedby={touched && emailProblem ? 'member-email-error' : undefined}
            autoComplete="off"
          />
          {touched && emailProblem && <span id="member-email-error" className="field-help is-bad" role="alert">{emailProblem}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="member-name-input">Name (optional)</label>
          <input id="member-name-input" className="form-control" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="member-role-select">Role</label>
            <select id="member-role-select" className="form-control" value={role} onChange={(e) => setRole(e.target.value)}>
              {policy.roles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            {roleProblem && <span className="field-help is-bad" role="alert">{roleProblem}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="member-status-select">Status</label>
            <select id="member-status-select" className="form-control" value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
        {error && <p role="alert" className="is-bad">{error}</p>}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving' : 'Add member'}</button>
        </div>
      </form>
    </Dialog>
  );
};
