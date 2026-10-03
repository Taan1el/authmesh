import React, { useState } from 'react';
import { KeyRound, ShieldCheck, User as UserIcon } from 'lucide-react';
import { AuditEvent } from '../../../shared/types';
import { pluralize } from '../utils/pluralize.js';

interface AuditLedgerFeedProps {
  events: AuditEvent[];
  onVerifyChain: () => void;
  isVerifying: boolean;
  chainValid?: boolean;
  deniedLast24h?: number;
}

function maskHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-6)}`;
}

export const AuditLedgerFeed: React.FC<AuditLedgerFeedProps> = ({
  events,
  onVerifyChain,
  isVerifying,
  chainValid,
  deniedLast24h,
}) => {
  const [filter, setFilter] = useState<'all' | 'granted' | 'denied'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grantedCount = events.filter((e) => e.status === 'granted').length;
  const deniedCount = events.filter((e) => e.status === 'denied').length;

  const filtered = events.filter((e) => {
    if (filter === 'granted') return e.status === 'granted';
    if (filter === 'denied') return e.status === 'denied';
    return true;
  });

  return (
    <section className="panel" aria-labelledby="audit-title">
      <div className="panel-heading">
        <div>
          <h2 id="audit-title">Audit log</h2>
          <p className="panel-description">
            Every access decision, chained by hash so a changed entry breaks verification.
          </p>
        </div>
        <div className="panel-heading-meta">
          {chainValid !== undefined && (
            <span className={chainValid ? 'status-pill active' : 'status-pill suspended'}>
              <ShieldCheck size={14} aria-hidden="true" />
              {chainValid ? 'Chain verified' : 'Chain broken'}
            </span>
          )}
          <button className="btn btn-secondary" onClick={onVerifyChain} disabled={isVerifying}>
            {isVerifying ? 'Verifying' : 'Verify chain'}
          </button>
        </div>
      </div>

      <div className="filter-tabs" role="group" aria-label="Filter audit events">
        <button
          type="button"
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All ({events.length})
        </button>
        <button
          type="button"
          className={`filter-tab ${filter === 'granted' ? 'active' : ''}`}
          aria-pressed={filter === 'granted'}
          onClick={() => setFilter('granted')}
        >
          Granted ({grantedCount})
        </button>
        <button
          type="button"
          className={`filter-tab ${filter === 'denied' ? 'active' : ''}`}
          aria-pressed={filter === 'denied'}
          onClick={() => setFilter('denied')}
        >
          Denied ({deniedCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No audit events match this filter.</p>
      ) : (
        <ul className="dense-list">
          {filtered.map((ev) => {
            const expanded = expandedId === ev.id;
            return (
              <li key={ev.id} className="dense-row">
                <div className="dense-row-main">
                  <strong>
                    {ev.actor_type === 'api_key' ? (
                      <KeyRound size={14} aria-hidden="true" />
                    ) : (
                      <UserIcon size={14} aria-hidden="true" />
                    )}
                    {ev.actor_name}
                    <span className={ev.status === 'granted' ? 'status-pill active' : 'status-pill denied'}>
                      {ev.status}
                    </span>
                  </strong>
                  <small>
                    {ev.action} on {ev.resource} &middot; {new Date(ev.created_at).toLocaleTimeString()}
                  </small>
                </div>
                <div className="dense-row-side">
                  <span className="dense-row-value" title={ev.hash}>
                    {maskHash(ev.hash)}
                  </span>
                  <button
                    type="button"
                    className="btn-action"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : ev.id)}
                  >
                    {expanded ? 'Hide' : 'Details'}
                  </button>
                </div>
                {expanded && (
                  <div className="dense-row-detail">
                    <dl>
                      <div>
                        <dt>IP address</dt>
                        <dd>{ev.ip_address}</dd>
                      </div>
                      <div>
                        <dt>User agent</dt>
                        <dd>{ev.user_agent}</dd>
                      </div>
                      <div>
                        <dt>Previous hash</dt>
                        <dd>{ev.prev_hash}</dd>
                      </div>
                      <div>
                        <dt>Block hash</dt>
                        <dd>{ev.hash}</dd>
                      </div>
                    </dl>
                    <pre role="region" tabIndex={0} aria-label="Event details">{JSON.stringify(JSON.parse(ev.details), null, 2)}</pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="muted panel-foot">
        Showing {filtered.length} {pluralize(filtered.length, 'entry', 'entries')}.
        {deniedLast24h !== undefined && ` ${deniedLast24h} denied in the last 24 hours.`}
      </p>
    </section>
  );
};
