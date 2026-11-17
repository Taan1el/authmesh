import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { formatIssue, parsePolicyText, POLICY_LIMITS, serializePolicy, type Policy, type PolicyIssue } from '../../../shared/policy-file';
import { downloadFile } from '../local/files.js';
import {
  chooseWorkspaceMode,
  dismissNotice,
  initializeWorkspace,
  markBackedUp,
  removeWorkspace,
  replaceWorkspace,
  subscribeWorkspace,
  workspaceState,
  type WorkspaceMode,
} from '../local/policyWorkspace.js';
import { pluralize } from '../utils/pluralize.js';
import { ConfirmDialog, Dialog } from './Dialog';

interface WorkspaceBarProps {
  /** The sample organization as a policy, exported when the sample data is selected. */
  samplePolicy: Policy;
}

function counts(policy: Policy): string {
  return `${policy.roles.length} ${pluralize(policy.roles.length, 'role')} and ${policy.members.length} ${pluralize(policy.members.length, 'member')}`;
}

interface ImportDialogProps {
  saved: Policy | null;
  onClose: () => void;
  onImported: (policy: Policy) => void;
}

/** Reads a policy file, validates it, and states what it will replace before anything is saved. */
const ImportDialog: React.FC<ImportDialogProps> = ({ saved, onClose, onImported }) => {
  const [fileName, setFileName] = useState('');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [issues, setIssues] = useState<PolicyIssue[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const choose = async (file: File | undefined) => {
    setPolicy(null);
    setIssues([]);
    setError('');
    setFileName(file?.name ?? '');
    if (!file) return;
    if (file.size > POLICY_LIMITS.fileBytes) {
      setIssues([{ path: 'file', message: `expected a file of at most ${POLICY_LIMITS.fileBytes / (1024 * 1024)} MB, got ${(file.size / (1024 * 1024)).toFixed(1)} MB` }]);
      return;
    }
    const result = parsePolicyText(await file.text());
    if (result.ok) {
      setPolicy(result.policy);
    } else {
      setIssues(result.issues);
      setTruncated(result.truncated);
    }
  };

  const confirm = async () => {
    if (!policy) return;
    setBusy(true);
    setError('');
    try {
      await replaceWorkspace(policy, policy);
      onImported(policy);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The workspace could not be saved. Your current workspace was kept.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Import policy file"
      onClose={onClose}
      initialFocusRef={fileRef}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={!policy || busy}>
            {busy ? 'Saving' : saved ? 'Replace workspace' : 'Import into workspace'}
          </button>
        </>
      }
    >
      <p>Choose a <code>policy.json</code> file, up to 5 MB. It is checked completely before anything is saved.</p>
      <div className="form-group">
        <label htmlFor="import-policy-file">Policy file</label>
        <input
          id="import-policy-file"
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="form-control file-plain"
          disabled={busy}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>
      <div role="status">
        {policy && (
          <p>
            <strong>{fileName}</strong> is valid: {counts(policy)}.{' '}
            {saved
              ? `Importing replaces your saved workspace (${counts(saved)}) with these. Export a backup first if you need the old one.`
              : 'Importing creates your workspace from it.'}
          </p>
        )}
      </div>
      {issues.length > 0 && (
        <div role="alert" className="problem-box">
          <p><strong>{fileName} is not a valid policy file.</strong> Nothing was changed.</p>
          <ul className="problem-list">
            {issues.map((issue) => <li key={formatIssue(issue)}>{formatIssue(issue)}</li>)}
          </ul>
          {truncated && <p className="field-help">More problems follow. Fix these first.</p>}
        </div>
      )}
      {error && <p role="alert" className="is-bad">{error}</p>}
    </Dialog>
  );
};

/** Switch between sample data and your own workspace, and import or export the policy. */
export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({ samplePolicy }) => {
  const state = useSyncExternalStore(subscribeWorkspace, workspaceState, workspaceState);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    void initializeWorkspace().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Browser storage is unavailable. Check storage permissions and keep exported backups.');
    });
  }, []);

  const inWorkspace = state.mode === 'workspace';
  const activePolicy = inWorkspace ? state.policy : samplePolicy;

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The operation failed. Your data was kept.');
    } finally {
      setBusy(false);
    }
  };

  const exportPolicy = () =>
    run(async () => {
      if (!activePolicy) throw new Error('There is no policy to export yet. Import a file or start from the sample policy.');
      downloadFile('policy.json', serializePolicy(activePolicy), 'application/json');
      if (inWorkspace) await markBackedUp();
      setFlash(`Exported ${counts(activePolicy)} to policy.json.`);
    });

  return (
    <section className="workspace-bar" aria-label="Workspace">
      <div className="workspace-controls">
        <div className="form-group workspace-mode">
          <label htmlFor="workspace-data-source">Data source</label>
          <select
            id="workspace-data-source"
            className="form-control"
            value={state.mode}
            disabled={busy}
            onChange={(e) => void run(() => chooseWorkspaceMode(e.target.value as WorkspaceMode))}
          >
            <option value="sample">Sample data</option>
            <option value="workspace">Your workspace</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setError(''); setFlash(''); setImporting(true); }}>
          <Upload size={16} aria-hidden="true" />
          Import policy
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || !activePolicy} onClick={() => void exportPolicy()}>
          <Download size={16} aria-hidden="true" />
          Export policy
        </button>
        {inWorkspace && state.policy && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setClearing(true)}>
            <Trash2 size={16} aria-hidden="true" />
            Clear workspace
          </button>
        )}
      </div>

      <p className="workspace-note">
        Your data stays in this browser: nothing is uploaded. This page designs and tests an access policy. It does not protect a live API.
      </p>
      <div role="status" className="workspace-status">
        {flash && <p className="workspace-note">{flash}</p>}
        {inWorkspace && state.unbacked && (
          <p className="workspace-note">
            Changes are saved in this browser only.{' '}
            <button type="button" className="link-btn" disabled={busy} onClick={() => void exportPolicy()}>Export a backup file</button>
          </p>
        )}
        {state.notice && (
          <p className="workspace-note">
            {state.notice}{' '}
            <button type="button" className="link-btn" onClick={dismissNotice}>Dismiss</button>
          </p>
        )}
      </div>
      {error && !importing && <p role="alert" className="is-bad workspace-note">{error}</p>}

      {importing && (
        <ImportDialog
          saved={state.policy}
          onClose={() => setImporting(false)}
          onImported={(policy) => setFlash(`Imported ${counts(policy)} into your workspace.`)}
        />
      )}
      {clearing && state.policy && (
        <ConfirmDialog
          title="Clear workspace"
          confirmLabel="Clear workspace"
          busy={busy}
          onClose={() => setClearing(false)}
          onConfirm={() => {
            void run(async () => {
              await removeWorkspace();
              setClearing(false);
              setFlash('Workspace cleared.');
            });
          }}
        >
          <p>This removes {counts(state.policy)} from this browser. It cannot be undone.{state.unbacked ? ' You have changes that were not exported.' : ''}</p>
        </ConfirmDialog>
      )}
    </section>
  );
};
