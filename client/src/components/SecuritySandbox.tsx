import React, { useEffect, useState } from 'react';
import { ApiKey, User } from '../../../shared/types';
import { api } from '../services/index';

interface SecuritySandboxProps {
  users: User[];
  apiKeys: ApiKey[];
  onAuditUpdated: () => void;
}

const TEST_ENDPOINTS = [
  {
    path: 'billing',
    method: 'GET' as const,
    required: 'billing:read',
    description: 'Read confidential SEPA billing records and monthly MRR',
  },
  {
    path: 'billing/invoice',
    method: 'POST' as const,
    required: 'billing:write',
    description: 'Issue new customer invoice via payment gateway',
  },
  {
    path: 'users',
    method: 'GET' as const,
    required: 'users:read',
    description: 'List tenant member credentials and emails',
  },
  {
    path: 'deploy',
    method: 'POST' as const,
    required: 'deploy:execute',
    description: 'Trigger production Kubernetes release deployment',
  },
];

// Maps an evaluation's HTTP status to a badge label and CSS modifier. Kept
// as an explicit table instead of a status/429/else ternary so 401
// (unrecognized token) does not get mislabeled as "FORBIDDEN" (403, a
// recognized but insufficiently scoped token or role).
const STATUS_LABELS: Record<number, { label: string; css: string }> = {
  200: { label: 'OK', css: '200' },
  401: { label: 'UNAUTHORIZED', css: '401' },
  403: { label: 'FORBIDDEN', css: '403' },
  429: { label: 'TOO MANY REQUESTS', css: '429' },
};

function describeStatus(status: number): { label: string; css: string } {
  return STATUS_LABELS[status] ?? { label: 'ERROR', css: '403' };
}

export const SecuritySandbox: React.FC<SecuritySandboxProps> = ({
  users,
  apiKeys,
  onAuditUpdated,
}) => {
  const [authMode, setAuthMode] = useState<'user' | 'custom_token'>('user');
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [customToken, setCustomToken] = useState<string>('am_live_ci_cd_deployment_token_001_mock');
  const [selectedEndpoint, setSelectedEndpoint] = useState(TEST_ENDPOINTS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    status: number;
    headers: Record<string, string>;
    data: any;
  } | null>(null);

  // `users` arrives asynchronously after the initial render (App.tsx loads
  // it from the API), so the useState default above is usually empty on
  // first paint even though the dropdown visually shows the first option.
  // Keep the selection in sync once users load, and if the selected user
  // ever stops existing, so "Dispatch Request" never silently sends an
  // empty user_id for what looks like a selected user.
  useEffect(() => {
    if (users.length === 0) return;
    if (!users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const handleSimulate = async () => {
    setIsLoading(true);
    try {
      const authValue = authMode === 'user' ? selectedUserId : customToken;
      const res = await api.simulateProtectedRequest(
        selectedEndpoint.path,
        selectedEndpoint.method,
        authMode === 'user' ? 'user' : 'token',
        authValue
      );
      setLastResult(res);
      onAuditUpdated();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpamBurst = async () => {
    setIsLoading(true);
    try {
      const authValue = authMode === 'user' ? selectedUserId : customToken;
      for (let i = 0; i < 4; i++) {
        const res = await api.simulateProtectedRequest(
          selectedEndpoint.path,
          selectedEndpoint.method,
          authMode === 'user' ? 'user' : 'token',
          authValue
        );
        setLastResult(res);
      }
      onAuditUpdated();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Interactive RBAC Security Sandbox</h3>
          <p className="subtitle">
            Simulate requests against protected API routes to verify zero-trust policies, rate limits, and 403 enforcement
          </p>
        </div>
      </div>

      <div className="sandbox-grid">
        <div className="sandbox-controls">
          <fieldset className="form-group mb-3">
            <legend>Authentication Identity Source</legend>
            <div className="tab-pills">
              <button
                type="button"
                className={`tab-btn ${authMode === 'user' ? 'active' : ''}`}
                aria-pressed={authMode === 'user'}
                onClick={() => setAuthMode('user')}
              >
                Tenant User (x-user-id)
              </button>
              <button
                type="button"
                className={`tab-btn ${authMode === 'custom_token' ? 'active' : ''}`}
                aria-pressed={authMode === 'custom_token'}
                onClick={() => setAuthMode('custom_token')}
              >
                API Key Bearer Token
              </button>
            </div>
          </fieldset>

          {authMode === 'user' ? (
            <div className="form-group mb-3">
              <label htmlFor="sandbox-user-select">Simulated User</label>
              <select
                id="sandbox-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="form-control"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — Role: {u.role.toUpperCase()} ({u.status})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group mb-3">
              <label htmlFor="sandbox-token-input">API Key Bearer Token</label>
              <input
                id="sandbox-token-input"
                type="text"
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="am_live_..."
                className="form-control font-mono text-xs"
              />
              <div className="preset-tokens-wrap mt-2">
                <span className="text-muted text-xs mr-2">Active Key Registry ({apiKeys.length}):</span>
                {apiKeys.map((k) => (
                  <span key={k.id} className="badge-mini mr-1 text-muted text-xs" title={`Scopes: ${k.scopes.join(', ')}`}>
                    {k.name}
                  </span>
                ))}
              </div>
              <div className="preset-tokens-wrap mt-2">
                <span className="text-muted text-xs mr-2">Quick Presets:</span>
                <button
                  type="button"
                  className="btn-preset-token"
                  onClick={() => setCustomToken('am_live_ci_cd_deployment_token_001_mock')}
                >
                  CI/CD Deploy Key
                </button>
                <button
                  type="button"
                  className="btn-preset-token"
                  onClick={() => setCustomToken('am_live_security_scanner_token_002_mock')}
                >
                  Security Scanner Key
                </button>
                <button
                  type="button"
                  className="btn-preset-token text-danger"
                  onClick={() => setCustomToken('am_live_invalid_attacker_token_999')}
                >
                  Attacker Token (Invalid)
                </button>
              </div>
            </div>
          )}

          <fieldset className="form-group mb-4">
            <legend>Target Protected Endpoint</legend>
            <div className="endpoints-list">
              {TEST_ENDPOINTS.map((ep) => {
                const isSelected = selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method;
                return (
                  <button
                    key={ep.path}
                    type="button"
                    className={`endpoint-option ${isSelected ? 'selected' : ''}`}
                    aria-pressed={isSelected}
                    title={ep.description}
                    onClick={() => setSelectedEndpoint(ep)}
                  >
                    <span className={`method-badge method-${ep.method}`}>{ep.method}</span>
                    <span className="font-mono text-xs ep-path">/api/protected/{ep.path}</span>
                    <span className="required-scope-pill">{ep.required}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="sandbox-actions">
            <button className="btn btn-primary" onClick={handleSimulate} disabled={isLoading}>
              {isLoading ? 'Evaluating...' : '🚀 Dispatch Request'}
            </button>
            <button
              className="btn btn-outline-warning"
              onClick={handleSpamBurst}
              disabled={isLoading}
              title="Sends 4 rapid requests to trigger token-bucket rate limiter"
            >
              ⚡ Test Rate Limiting (Burst 4x)
            </button>
          </div>
        </div>

        {/* Output Pane */}
        <div className="sandbox-output">
          <div className="output-header">
            <h4>Live Gateway Evaluation Output</h4>
            {lastResult && (
              <span className={`status-code-badge status-${describeStatus(lastResult.status).css}`}>
                HTTP {lastResult.status} {describeStatus(lastResult.status).label}
              </span>
            )}
          </div>

          {lastResult ? (
            <div className="output-body">
              <div className="headers-box">
                <span className="text-muted text-xs">Security Rate-Limit Headers:</span>
                <div className="headers-grid">
                  <div>
                    Limit: <code>{lastResult.headers['x-ratelimit-limit']}</code>
                  </div>
                  <div>
                    Remaining: <code>{lastResult.headers['x-ratelimit-remaining']}</code>
                  </div>
                  <div>
                    Reset in: <code>{lastResult.headers['x-ratelimit-reset']}s</code>
                  </div>
                </div>
              </div>

              <pre className="json-output">{JSON.stringify(lastResult.data, null, 2)}</pre>
            </div>
          ) : (
            <div className="output-placeholder">
              <span>🛡️</span>
              <p>Select an actor and target endpoint, then click Dispatch Request to inspect live RBAC evaluation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
