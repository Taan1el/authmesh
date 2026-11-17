import React, { useMemo, useRef, useState } from 'react';
import { Download, Link2, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import {
  AUDIT_LOG_LIMITS,
  parseAuditLogText,
  verifyAuditLog,
  type AuditLogIssue,
  type ChainVerification,
} from '../../../shared/audit-verify';
import type { AuditEvent } from '../../../shared/types';
import { calculateAuditHash } from '../services/demoCrypto.js';
import { pluralize } from '../utils/pluralize.js';

const PAGE_SIZE = 25;

interface AuditVerifierProps {
  /** When given, shows a button that downloads the log the console currently holds, ready to verify. */
  onExportCurrent?: () => Promise<void>;
}

interface Loaded {
  name: string;
  events: AuditEvent[];
  result: ChainVerification;
}

function maskHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

/** Checks an audit log file against its own hash chain, in the browser, and points at the first broken entry. */
export const AuditVerifier: React.FC<AuditVerifierProps> = ({ onExportCurrent }) => {
  const [pasted, setPasted] = useState('');
  const [excerpt, setExcerpt] = useState(false);
  const [issues, setIssues] = useState<AuditLogIssue[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const brokenRowRef = useRef<HTMLTableRowElement>(null);

  const verifyText = (text: string, name: string) => {
    setMessage('');
    const parsed = parseAuditLogText(text);
    if (!parsed.ok) {
      setLoaded(null);
      setIssues(parsed.issues);
      setTruncated(parsed.truncated);
      return;
    }
    setIssues([]);
    setTruncated(false);
    const result = verifyAuditLog(parsed.events, calculateAuditHash, { excerpt });
    setLoaded({ name, events: parsed.events, result });
    setPage(0);
  };

  const readFile = async (file: File) => {
    if (file.size > AUDIT_LOG_LIMITS.fileBytes) {
      setLoaded(null);
      setIssues([{ path: 'file', message: `expected a file of at most ${AUDIT_LOG_LIMITS.fileBytes / (1024 * 1024)} MB, got ${(file.size / (1024 * 1024)).toFixed(1)} MB` }]);
      return;
    }
    setBusy(true);
    try {
      verifyText(await file.text(), file.name);
    } catch {
      setLoaded(null);
      setIssues([{ path: 'file', message: 'the file could not be read' }]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const verifyPasted = () => {
    if (!pasted.trim()) {
      setLoaded(null);
      setIssues([{ path: 'file', message: 'paste the audit log JSON first, or choose a file' }]);
      return;
    }
    verifyText(pasted, 'Pasted log');
  };

  const rerun = (nextExcerpt: boolean) => {
    setExcerpt(nextExcerpt);
    if (loaded) {
      setLoaded({ ...loaded, result: verifyAuditLog(loaded.events, calculateAuditHash, { excerpt: nextExcerpt }) });
    }
  };

  const exportCurrent = async () => {
    if (!onExportCurrent) return;
    setBusy(true);
    setMessage('');
    try {
      await onExportCurrent();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'The log could not be exported.');
    } finally {
      setBusy(false);
    }
  };

  const view = useMemo(() => {
    if (!loaded) return null;
    const { events, result } = loaded;
    const rows = events.map((event, fileIndex) => ({ event, fileIndex }));
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const current = Math.min(page, pageCount - 1);
    return { rows: rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE), pageCount, current, problemFiles: new Set(result.problems.map((item) => item.fileIndex)) };
  }, [loaded, page]);

  const goToFirstBroken = () => {
    if (!loaded?.result.firstBroken) return;
    setPage(Math.floor(loaded.result.firstBroken.fileIndex / PAGE_SIZE));
    setTimeout(() => brokenRowRef.current?.focus(), 0);
  };

  const first = loaded?.result.firstBroken;

  return (
    <section className="panel" aria-labelledby="verify-title">
      <div className="panel-heading">
        <div>
          <h2 id="verify-title">Verify an audit log file</h2>
          <p className="panel-description">
            Paste or open a log exported from AuthMesh. Each entry stores the hash of the one before it, so a changed, removed or moved entry breaks the chain at that point.
          </p>
        </div>
        {onExportCurrent && (
          <button type="button" className="btn btn-secondary" onClick={() => void exportCurrent()} disabled={busy}>
            <Download size={16} aria-hidden="true" />
            Export current log
          </button>
        )}
      </div>

      <div className="verify-inputs">
        <div className="form-group">
          <label htmlFor="verify-paste">Audit log JSON</label>
          <textarea
            id="verify-paste"
            className="form-control permissions-input cell-mono"
            rows={4}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            aria-describedby="verify-help"
          />
          <span id="verify-help" className="field-help">A list of entries, or an object with them under events. Files up to 25 MB and 200,000 entries.</span>
        </div>
        <div className="verify-actions">
          <button type="button" className="btn btn-primary" onClick={verifyPasted} disabled={busy}>
            <ShieldCheck size={16} aria-hidden="true" />
            Verify pasted log
          </button>
          <label className="btn btn-secondary file-button">
            <Upload size={16} aria-hidden="true" />
            <span>{busy ? 'Reading file' : 'Open log file'}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="file-input"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={excerpt} onChange={(e) => rerun(e.target.checked)} />
            <span>This file is an excerpt</span>
          </label>
        </div>
        <p className="field-help">An excerpt starts after the first entry ever written, so its first entry need not point at the starting hash.</p>
      </div>

      {message && <p role="alert" className="is-bad">{message}</p>}

      {issues.length > 0 && (
        <div role="alert" className="problem-box">
          <p><strong>This file cannot be verified.</strong> It is not an AuthMesh audit log in the expected format.</p>
          <ul className="problem-list">
            {issues.map((issue) => <li key={`${issue.path}-${issue.message}`}><code>{issue.path}</code>: {issue.message}</li>)}
          </ul>
          {truncated && <p className="field-help">More problems follow. Fix these first.</p>}
        </div>
      )}

      <div role="status" className="verify-result-region">
        {loaded && (
          loaded.result.valid ? (
            <p className="verify-result ok">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                Chain intact: {loaded.result.total} {pluralize(loaded.result.total, 'entry', 'entries')} in {loaded.name} verified, {loaded.result.order === 'oldest-first' ? 'oldest first' : 'newest first'}.
              </span>
            </p>
          ) : (
            <div className="verify-result bad">
              <p>
                <ShieldAlert size={18} aria-hidden="true" />
                <span>
                  Chain broken at entry {first?.entryNumber} of {loaded.result.total} (<code>{first?.id}</code>).
                </span>
              </p>
              <p>{first?.message}</p>
              <p className="field-help">
                {loaded.result.problems.length} {pluralize(loaded.result.problems.length, 'problem')} found in total
                {loaded.result.problems.length >= 500 ? ' (stopped counting at 500)' : ''}. Entries are numbered oldest first.
              </p>
              <button type="button" className="btn btn-secondary" onClick={goToFirstBroken}>
                <Link2 size={16} aria-hidden="true" />
                Show the first broken entry
              </button>
            </div>
          )
        )}
      </div>

      {loaded && view && (
        <>
          <div className="table-wrapper" role="region" tabIndex={0} aria-label="Verified audit entries table">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">File row</th>
                  <th scope="col">Time</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Status</th>
                  <th scope="col">Hash</th>
                  <th scope="col">Chain</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map(({ event, fileIndex }) => {
                  const isFirst = first?.fileIndex === fileIndex;
                  const broken = view.problemFiles.has(fileIndex);
                  return (
                    <tr key={`${fileIndex}-${event.id}`} ref={isFirst ? brokenRowRef : undefined} tabIndex={isFirst ? -1 : undefined} className={broken ? 'row-broken' : undefined}>
                      <td className="cell-mono">{fileIndex + 1}</td>
                      <td className="cell-mono">{event.created_at}</td>
                      <td>{event.actor_name}</td>
                      <td className="cell-mono">{event.action}</td>
                      <td><span className={`status-pill ${event.status === 'granted' ? 'active' : 'denied'}`}>{event.status}</span></td>
                      <td className="cell-mono" title={event.hash}>{maskHash(event.hash)}</td>
                      <td>{isFirst ? <strong className="is-bad">First broken entry</strong> : broken ? <span className="is-bad">Broken</span> : <span className="muted">Valid</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-secondary" onClick={() => setPage(view.current - 1)} disabled={view.current === 0}>Previous page</button>
            <span className="muted">Page {view.current + 1} of {view.pageCount}, {loaded.events.length} {pluralize(loaded.events.length, 'entry', 'entries')}</span>
            <button type="button" className="btn btn-secondary" onClick={() => setPage(view.current + 1)} disabled={view.current >= view.pageCount - 1}>Next page</button>
          </div>
        </>
      )}

      <p className="muted panel-foot">
        The chain covers the previous hash, actor id, action, resource, status, time and details. Changing only an actor name, IP address or user agent is not detected.
      </p>
    </section>
  );
};
