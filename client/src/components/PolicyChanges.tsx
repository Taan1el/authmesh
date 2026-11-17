import React, { useId, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { diffPolicies, diffToMarkdown } from '../../../shared/policy-diff';
import { formatIssue, parsePolicyText, POLICY_LIMITS, type Policy, type PolicyIssue } from '../../../shared/policy-file';
import { DiffReport } from './DiffReport';

type Source = 'current' | 'backup' | 'file';

interface PolicyChangesProps {
  /** The policy being edited: the workspace policy, or the sample organization's. */
  current: Policy;
  currentLabel: string;
  /** The workspace baseline: the last export, import or starting point. Null in sample mode. */
  backup: Policy | null;
  onDownload: (name: string, content: string, type: string) => void;
}

interface Slot {
  source: Source;
  fileName: string;
  policy: Policy | null;
  issues: PolicyIssue[];
}

function emptySlot(source: Source): Slot {
  return { source, fileName: '', policy: null, issues: [] };
}

/** Compares two versions of a policy and exports the difference as a Markdown change review. */
export const PolicyChanges: React.FC<PolicyChangesProps> = ({ current, currentLabel, backup, onDownload }) => {
  const hasBackup = backup !== null;
  const [before, setBefore] = useState<Slot>(emptySlot(hasBackup ? 'backup' : 'file'));
  const [after, setAfter] = useState<Slot>(emptySlot('current'));
  const beforeId = useId();
  const afterId = useId();

  const resolve = (slot: Slot): Policy | null => (slot.source === 'current' ? current : slot.source === 'backup' ? backup : slot.policy);
  const labelOf = (slot: Slot): string =>
    slot.source === 'current' ? currentLabel : slot.source === 'backup' ? 'Baseline (last export, import or start)' : slot.fileName || 'Policy file';

  const beforePolicy = resolve(before);
  const afterPolicy = resolve(after);
  const diff = useMemo(
    () => (beforePolicy && afterPolicy ? diffPolicies(beforePolicy, afterPolicy) : null),
    [beforePolicy, afterPolicy]
  );

  const readFile = async (file: File, set: (slot: Slot) => void) => {
    if (file.size > POLICY_LIMITS.fileBytes) {
      set({ source: 'file', fileName: file.name, policy: null, issues: [{ path: 'file', message: `expected a file of at most ${POLICY_LIMITS.fileBytes / (1024 * 1024)} MB` }] });
      return;
    }
    const result = parsePolicyText(await file.text());
    set(result.ok
      ? { source: 'file', fileName: file.name, policy: result.policy, issues: [] }
      : { source: 'file', fileName: file.name, policy: null, issues: result.issues });
  };

  const renderSlot = (id: string, title: string, slot: Slot, set: (slot: Slot) => void) => (
    <div className="form-group compare-slot">
      <label htmlFor={`${id}-source`}>{title}</label>
      <select
        id={`${id}-source`}
        className="form-control"
        value={slot.source}
        onChange={(e) => set({ ...emptySlot(e.target.value as Source) })}
      >
        <option value="current">{currentLabel}</option>
        {hasBackup && <option value="backup">Baseline</option>}
        <option value="file">A policy file</option>
      </select>
      {slot.source === 'file' && (
        <>
          <label htmlFor={`${id}-file`} className="sr-only">{title} policy file</label>
          <input
            id={`${id}-file`}
            type="file"
            accept=".json,application/json"
            className="form-control file-plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file, set);
            }}
          />
          {slot.fileName && slot.policy && <span className="field-help">{slot.fileName}: {slot.policy.roles.length} roles, {slot.policy.members.length} members.</span>}
        </>
      )}
      {slot.issues.length > 0 && (
        <div role="alert" className="problem-box">
          <p><strong>{slot.fileName} is not a valid policy file.</strong></p>
          <ul className="problem-list">
            {slot.issues.slice(0, 6).map((issue) => <li key={formatIssue(issue)}>{formatIssue(issue)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );

  const exportMarkdown = () => {
    if (!diff) return;
    onDownload('policy-changes.md', diffToMarkdown(diff, { before: labelOf(before), after: labelOf(after) }), 'text/markdown');
  };

  return (
    <section className="panel" aria-labelledby="changes-title">
      <div className="panel-heading">
        <div>
          <h2 id="changes-title">Changes</h2>
          <p className="panel-description">Compare two versions of a policy: exactly which scopes were added or removed, and which members gain or lose which permission.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportMarkdown} disabled={!diff}>
          <Download size={16} aria-hidden="true" />
          Export as Markdown
        </button>
      </div>

      {hasBackup && <p className="field-help">The baseline is the version you last exported or imported, or the one you started from.</p>}
      <div className="compare-grid">
        {renderSlot(beforeId, 'Before', before, setBefore)}
        {renderSlot(afterId, 'After', after, setAfter)}
      </div>

      <div className="compare-result">
        {diff ? <DiffReport diff={diff} /> : <p className="muted">Choose two versions to compare.</p>}
      </div>
    </section>
  );
};
