import React, { useState } from 'react';
import { AuditEvent } from '../../../shared/types';

interface AuditLedgerFeedProps {
  events: AuditEvent[];
  onVerifyChain: () => void;
  isVerifying: boolean;
}

export const AuditLedgerFeed: React.FC<AuditLedgerFeedProps> = ({
  events,
  onVerifyChain,
  isVerifying,
}) => {
  const [filter, setFilter] = useState<'all' | 'granted' | 'denied'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = events.filter((e) => {
    if (filter === 'granted') return e.status === 'granted';
    if (filter === 'denied') return e.status === 'denied';
    return true;
  });

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Cryptographically Chained Audit Ledger</h3>
          <p className="subtitle">
            Immutable SHA-256 block ledger tracking all access decisions, token usage, and administrative actions
          </p>
          <div className="tab-pills mt-2">
            <button
              className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Events ({events.length})
            </button>
            <button
              className={`tab-btn ${filter === 'granted' ? 'active' : ''}`}
              onClick={() => setFilter('granted')}
            >
              Granted ({events.filter((e) => e.status === 'granted').length})
            </button>
            <button
              className={`tab-btn ${filter === 'denied' ? 'active' : ''}`}
              onClick={() => setFilter('denied')}
            >
              Denied / Violations ({events.filter((e) => e.status === 'denied').length})
            </button>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onVerifyChain} disabled={isVerifying}>
          {isVerifying ? 'Verifying Hashes...' : '🔒 Verify Chain Integrity'}
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Outcome</th>
              <th>Block SHA-256 Hash</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) => (
              <React.Fragment key={ev.id}>
                <tr className="table-row">
                  <td className="text-muted text-xs font-mono">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </td>
                  <td>
                    <div className="actor-badge">
                      <span className="actor-type">{ev.actor_type === 'api_key' ? '🔑' : '👤'}</span>
                      <span className="font-semibold">{ev.actor_name}</span>
                    </div>
                  </td>
                  <td className="font-mono text-xs">{ev.action}</td>
                  <td>
                    <span className="resource-pill">{ev.resource}</span>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        ev.status === 'granted' ? 'pill-granted' : 'pill-denied'
                      }`}
                    >
                      {ev.status}
                    </span>
                  </td>
                  <td>
                    <div className="hash-container">
                      <span className="font-mono hash-text" title={`Full Hash: ${ev.hash}`}>
                        {ev.hash.slice(0, 14)}...
                      </span>
                      <span className="hash-link" title={`Previous Hash: ${ev.prev_hash}`}>
                        ⛓️
                      </span>
                    </div>
                  </td>
                  <td>
                    <button
                      className="btn-action btn-secondary"
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                    >
                      {expandedId === ev.id ? 'Hide' : 'Inspect'}
                    </button>
                  </td>
                </tr>
                {expandedId === ev.id && (
                  <tr className="expanded-detail-row">
                    <td colSpan={7}>
                      <div className="audit-detail-pane">
                        <div className="detail-meta">
                          <div>
                            <strong>IP Address:</strong> <code>{ev.ip_address}</code>
                          </div>
                          <div>
                            <strong>User-Agent:</strong> <code>{ev.user_agent}</code>
                          </div>
                          <div>
                            <strong>Previous Block Hash:</strong> <code>{ev.prev_hash}</code>
                          </div>
                          <div>
                            <strong>Current Block Hash:</strong> <code>{ev.hash}</code>
                          </div>
                        </div>
                        <pre className="detail-json">{JSON.stringify(JSON.parse(ev.details), null, 2)}</pre>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-muted">
                  No audit events found for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
