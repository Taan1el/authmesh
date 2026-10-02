import React, { useEffect, useState } from 'react';
import { Send, ShieldQuestion, Zap } from 'lucide-react';
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
    description: 'Read confidential billing records and monthly recurring revenue',
  },
  {
    path: 'billing/invoice',
    method: 'POST' as const,
    required: 'billing:write',
    description: 'Issue a new customer invoice',
  },
  {
    path: 'users',
    method: 'GET' as const,
    required: 'users:read',
    description: 'List member accounts and emails',
  },
  {
    path: 'deploy',
    method: 'POST' as const,
    required: 'deploy:execute',
    description: 'Trigger a production deployment',
  },
];

// Maps an evaluation's HTTP status to a badge label and CSS modifier. Kept
// as an explicit table instead of a status/429/else ternary so 401
// (unrecognized token) does not get mislabeled as "FORBIDDEN" (403, a
// recognized but insufficiently scoped token or role).
const STATUS_LABELS: Record<number, { label: string; css: string }> = {
  200: { label: 'OK', css: 'ok' },
  401: { label: 'UNAUTHORIZED', css: 'bad' },
  403: { label: 'FORBIDDEN', css: 'bad' },
  429: { label: 'TOO MANY REQUESTS', css: 'warn' },
};

function describeStatus(status: number): { label: string; css: string } {
  return STATUS_LABELS[status] ?? { label: 'ERROR', css: 'bad' };
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
  // ever stops existing, so "Send request" never silently sends an empty
  // user_id for what looks like a selected user.
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
    <section className="panel" aria-labelledby="sandbox-title">
      <div className="panel-heading">
        <div>
          <h2 id="sandbox-title">Security sandbox</h2>
          <p className="panel-description">
            Send a request against a protected route to see the RBAC decision, rate limit, and audit entry it produces.
          </p>
        </div>
      </div>

      <div className="sandbox-grid">
        <div className="sandbox-form">
          <fieldset className="form-group">
            <legend>Identity</legend>
            <div className="auth-mode-tabs">
              <button
                type="button"
                className={`filter-tab ${authMode === 'user' ? 'active' : ''}`}
                aria-pressed={authMode === 'user'}
                onClick={() => setAuthMode('user')}
              >
                As a user
              </button>
              <button
                type="button"
                className={`filter-tab ${authMode === 'custom_token' ? 'active' : ''}`}
                aria-pressed={authMode === 'custom_token'}
                onClick={() => setAuthMode('custom_token')}
              >
                As an API key
              </button>
            </div>
          </fieldset>

          {authMode === 'user' ? (
            <div className="form-group">
              <label htmlFor="sandbox-user-select">Simulated user</label>
              <select
                id="sandbox-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="form-control"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}, {u.status})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="sandbox-token-input">API key bearer token</label>
              <input
                id="sandbox-token-input"
                type="text"
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="am_live_..."
                className="form-control cell-mono"
              />
              <div className="preset-tokens">
                <span className="label">Presets:</span>
                <button
                  type="button"
                  className="btn-preset"
                  onClick={() => setCustomToken('am_live_ci_cd_deployment_token_001_mock')}
                >
                  CI/CD key
                </button>
                <button
                  type="button"
                  className="btn-preset"
                  onClick={() => setCustomToken('am_live_security_scanner_token_002_mock')}
                >
                  Scanner key
                </button>
                <button
                  type="button"
                  className="btn-preset danger"
                  onClick={() => setCustomToken('am_live_invalid_attacker_token_999')}
                >
                  Invalid token
                </button>
              </div>
              {apiKeys.length > 0 && (
                <p className="field-help">{apiKeys.length} registered keys in the vault tab.</p>
              )}
            </div>
          )}

          <fieldset className="form-group">
            <legend>Target endpoint</legend>
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
                    <span className="method-tag">{ep.method}</span>
                    <span className="endpoint-path">/api/protected/{ep.path}</span>
                    <span className="endpoint-scope">{ep.required}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="sandbox-actions">
            <button className="btn btn-primary" onClick={handleSimulate} disabled={isLoading}>
              <Send size={16} aria-hidden="true" />
              {isLoading ? 'Sending' : 'Send request'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleSpamBurst}
              disabled={isLoading}
              title="Sends 4 rapid requests to trigger the rate limiter"
            >
              <Zap size={16} aria-hidden="true" />
              Send burst of 4
            </button>
          </div>
        </div>

        <div className="sandbox-output">
          <div className="output-header">
            <h3>Result</h3>
            {lastResult && (
              <span className={`status-code ${describeStatus(lastResult.status).css}`}>
                HTTP {lastResult.status} {describeStatus(lastResult.status).label}
              </span>
            )}
          </div>

          {lastResult ? (
            <div className="output-body">
              <div className="headers-box">
                <span className="label">Rate limit headers</span>
                <div className="headers-grid">
                  <div>Limit: {lastResult.headers['x-ratelimit-limit']}</div>
                  <div>Remaining: {lastResult.headers['x-ratelimit-remaining']}</div>
                  <div>Reset: {lastResult.headers['x-ratelimit-reset']}s</div>
                </div>
              </div>

              <pre className="json-output">{JSON.stringify(lastResult.data, null, 2)}</pre>
            </div>
          ) : (
            <div className="output-placeholder">
              <ShieldQuestion size={28} strokeWidth={1.5} aria-hidden="true" />
              <p>Choose an identity and an endpoint, then send a request to see the RBAC decision.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
