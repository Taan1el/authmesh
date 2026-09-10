import React, { useState } from 'react';
import { ApiKey, User } from '../../../shared/types';
import { api } from '../services/api';

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
          <div className="form-group mb-3">
            <label>Authentication Identity Source</label>
            <div className="tab-pills">
              <button
                type="button"
                className={`tab-btn ${authMode === 'user' ? 'active' : ''}`}
                onClick={() => setAuthMode('user')}
              >
                Tenant User (x-user-id)
              </button>
              <button
                type="button"
                className={`tab-btn ${authMode === 'custom_token' ? 'active' : ''}`}
                onClick={() => setAuthMode('custom_token')}
              >
                API Key Bearer Token
              </button>
            </div>
          </div>

          {authMode === 'user' ? (
            <div className="form-group mb-3">
              <label>Simulated User</label>
              <select
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
              <label>API Key Bearer Token</label>
              <input
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

          <div className="form-group mb-4">
            <label>Target Protected Endpoint</label>
            <div className="endpoints-list">
              {TEST_ENDPOINTS.map((ep) => (
                <div
                  key={ep.path}
                  className={`endpoint-option ${
                    selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method
                      ? 'selected'
                      : ''
                  }`}
                  onClick={() => setSelectedEndpoint(ep)}
                >
                  <span className={`method-badge method-${ep.method}`}>{ep.method}</span>
                  <span className="font-mono text-xs ep-path">/api/protected/{ep.path}</span>
                  <span className="required-scope-pill">{ep.required}</span>
                </div>
              ))}
            </div>
          </div>

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
              <span
                className={`status-code-badge status-${
                  lastResult.status === 200
                    ? '200'
                    : lastResult.status === 429
                    ? '429'
                    : '403'
                }`}
              >
                HTTP {lastResult.status} {lastResult.status === 200 ? 'OK' : lastResult.status === 429 ? 'TOO MANY REQUESTS' : 'FORBIDDEN'}
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
