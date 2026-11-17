import React, { useId, useMemo, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { checkAccess, requestedPermissionProblem, type CheckResult } from '../../../shared/policy-check';
import type { Policy } from '../../../shared/policy-file';
import { PROTECTED_ROUTES } from '../../../shared/routes';
import { STANDARD_PERMISSIONS } from '../../../shared/validation';

interface AccessTesterProps {
  policy: Policy;
  /** What the policy describes, for the heading text: "this workspace policy" or "the sample organization". */
  sourceLabel: string;
}

type SubjectKind = 'member' | 'role';
type RequestKind = 'permission' | 'route';

/** Answers "can this member or role do this" against a policy, with the exact reason. */
export const AccessTester: React.FC<AccessTesterProps> = ({ policy, sourceLabel }) => {
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('member');
  const [subject, setSubject] = useState('');
  const [requestKind, setRequestKind] = useState<RequestKind>('permission');
  const [permission, setPermission] = useState('');
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/protected/billing');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [formError, setFormError] = useState('');
  const subjectListId = useId();
  const permissionListId = useId();
  const pathListId = useId();

  const permissionOptions = useMemo(() => {
    const names = new Set<string>(STANDARD_PERMISSIONS);
    for (const role of policy.roles) for (const scope of role.permissions) if (scope !== '*' && !scope.endsWith(':*')) names.add(scope);
    return [...names].sort();
  }, [policy]);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (!subject.trim()) {
      setFormError(subjectKind === 'member' ? 'Enter a member email or name.' : 'Enter a role name.');
      return;
    }
    if (requestKind === 'permission') {
      const problem = requestedPermissionProblem(permission);
      if (problem) {
        setFormError(problem);
        return;
      }
    } else if (!path.trim()) {
      setFormError('Enter a request path such as /api/protected/billing.');
      return;
    }
    setFormError('');
    setResult(
      checkAccess(
        policy,
        { kind: subjectKind, query: subject },
        requestKind === 'permission' ? { kind: 'permission', permission } : { kind: 'route', method, path }
      )
    );
  };

  // Picking one of the guarded paths from the list also picks its method.
  const changePath = (value: string) => {
    setPath(value);
    const route = PROTECTED_ROUTES.find((item) => `/api${item.path}` === value.trim());
    if (route) setMethod(route.method);
  };

  return (
    <section className="panel" aria-labelledby="tester-title">
      <div className="panel-heading">
        <div>
          <h2 id="tester-title">Access test</h2>
          <p className="panel-description">Ask whether a member or a role can do something under {sourceLabel}. The answer uses the same matching rules as the gateway.</p>
        </div>
      </div>

      <form className="tester-form" onSubmit={run} noValidate>
        <fieldset className="form-group">
          <legend>Who</legend>
          <div className="filter-tabs" role="group" aria-label="Who to test">
            <button type="button" className={`filter-tab ${subjectKind === 'member' ? 'active' : ''}`} aria-pressed={subjectKind === 'member'} onClick={() => { setSubjectKind('member'); setResult(null); }}>Member</button>
            <button type="button" className={`filter-tab ${subjectKind === 'role' ? 'active' : ''}`} aria-pressed={subjectKind === 'role'} onClick={() => { setSubjectKind('role'); setResult(null); }}>Role</button>
          </div>
          <label htmlFor="tester-subject" className="sr-only">{subjectKind === 'member' ? 'Member email or name' : 'Role name'}</label>
          <input
            id="tester-subject"
            className="form-control"
            list={subjectListId}
            value={subject}
            placeholder={subjectKind === 'member' ? 'Email or name' : 'Role name'}
            onChange={(e) => setSubject(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id={subjectListId}>
            {subjectKind === 'member'
              ? policy.members.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)
              : policy.roles.map((role) => <option key={role.name} value={role.name} />)}
          </datalist>
        </fieldset>

        <fieldset className="form-group">
          <legend>Does what</legend>
          <div className="filter-tabs" role="group" aria-label="What to test">
            <button type="button" className={`filter-tab ${requestKind === 'permission' ? 'active' : ''}`} aria-pressed={requestKind === 'permission'} onClick={() => { setRequestKind('permission'); setResult(null); }}>Permission</button>
            <button type="button" className={`filter-tab ${requestKind === 'route' ? 'active' : ''}`} aria-pressed={requestKind === 'route'} onClick={() => { setRequestKind('route'); setResult(null); }}>Request</button>
          </div>
          {requestKind === 'permission' ? (
            <>
              <label htmlFor="tester-permission" className="sr-only">Permission</label>
              <input
                id="tester-permission"
                className="form-control cell-mono"
                list={permissionListId}
                value={permission}
                placeholder="users:read"
                onChange={(e) => setPermission(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <datalist id={permissionListId}>{permissionOptions.map((item) => <option key={item} value={item} />)}</datalist>
            </>
          ) : (
            <div className="tester-request">
              <div className="form-group">
                <label htmlFor="tester-method">Method</label>
                <select id="tester-method" className="form-control" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </div>
              <div className="form-group tester-path">
                <label htmlFor="tester-path">Path</label>
                <input
                  id="tester-path"
                  className="form-control cell-mono"
                  list={pathListId}
                  value={path}
                  onChange={(e) => changePath(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id={pathListId}>{PROTECTED_ROUTES.map((route) => <option key={route.endpoint} value={`/api${route.path}`}>{route.method}</option>)}</datalist>
              </div>
            </div>
          )}
        </fieldset>

        <div className="tester-actions">
          <button type="submit" className="btn btn-primary">Check access</button>
        </div>
      </form>

      {formError && <p role="alert" className="is-bad tester-error">{formError}</p>}

      <div role="status" className="tester-result-region">
        {result && <ResultCard result={result} />}
      </div>
    </section>
  );
};

const ResultCard: React.FC<{ result: CheckResult }> = ({ result }) => {
  if (!result.answered) {
    return (
      <div className="tester-result neutral">
        <p className="tester-verdict">No answer</p>
        <p>{result.explanation}</p>
      </div>
    );
  }
  return (
    <div className={`tester-result ${result.allowed ? 'allow' : 'deny'}`}>
      <p className="tester-verdict">
        {result.allowed ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}
        <span>{result.allowed ? 'Allowed' : 'Denied'}</span>
      </p>
      <dl className="tester-facts">
        <div><dt>Who</dt><dd>{result.subjectLabel}</dd></div>
        <div><dt>Permission</dt><dd className="cell-mono">{result.permission}{result.route ? ` (from ${result.route.method} /api${result.route.path})` : ''}</dd></div>
        <div><dt>Reason</dt><dd>{result.reason}</dd></div>
        {result.role && <div><dt>Role</dt><dd className="cell-mono">{result.role}</dd></div>}
        {result.matchingScope && <div><dt>Matching scope</dt><dd className="cell-mono">{result.matchingScope}</dd></div>}
      </dl>
      <p>{result.explanation}</p>
      <p className="field-help">
        {result.grantedBy.length === 0
          ? `No role in this policy grants ${result.permission}.`
          : `Roles that grant ${result.permission}: ${result.grantedBy.map((grant) => `${grant.role} (${grant.scope})`).join(', ')}.`}
      </p>
    </div>
  );
};
