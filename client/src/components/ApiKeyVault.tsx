import React, { useEffect, useRef, useState } from 'react';
import { ApiKey, CreateApiKeyDto } from '../../../shared/types';

interface ApiKeyVaultProps {
  apiKeys: ApiKey[];
  onCreateKey: (dto: CreateApiKeyDto) => Promise<ApiKey & { plaintext_token: string }>;
  onRevokeKey: (id: string) => Promise<void>;
}

const AVAILABLE_SCOPES = [
  'users:read',
  'users:write',
  'roles:assign',
  'keys:create',
  'keys:revoke',
  'billing:read',
  'billing:write',
  'audit:read',
  'deploy:read',
  'deploy:execute',
];

export const ApiKeyVault: React.FC<ApiKeyVaultProps> = ({
  apiKeys,
  onCreateKey,
  onRevokeKey,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['users:read']);
  const [rateLimitRpm, setRateLimitRpm] = useState('60');
  const [expiryDays, setExpiryDays] = useState('90');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Standard modal keyboard behavior: Escape closes it, and focus moves to
  // the first field so keyboard and screen reader users land somewhere
  // useful instead of on whatever was focused on the page behind it.
  useEffect(() => {
    if (!isModalOpen) return;
    nameInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Deliberately only re-runs when the modal opens or closes; closeModal
    // is stable enough for this component's lifetime that re-binding on
    // every render would just add noise.
  }, [isModalOpen]);

  const toggleScope = (scope: string) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || selectedScopes.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await onCreateKey({
        name,
        scopes: selectedScopes,
        rate_limit_rpm: parseInt(rateLimitRpm, 10),
        expires_in_days: expiryDays ? parseInt(expiryDays, 10) : undefined,
      });

      setRevealedToken(result.plaintext_token);
      setName('');
      setSelectedScopes(['users:read']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!revealedToken) return;
    navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setRevealedToken(null);
    setCopied(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Cryptographic API Key Vault</h3>
          <p className="subtitle">Hashed tokens with fine-grained capability scopes and token-bucket limits</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          + Generate New API Key
        </button>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Token Prefix</th>
              <th scope="col">Granted Scopes</th>
              <th scope="col">Quota (RPM)</th>
              <th scope="col">Last Used</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k) => (
              <tr key={k.id}>
                <td className="font-semibold">{k.name}</td>
                <td>
                  <span className="font-mono key-prefix-badge">{k.key_prefix}</span>
                </td>
                <td>
                  <div className="scopes-wrap">
                    {k.scopes.map((s) => (
                      <span key={s} className="scope-pill">
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="font-mono">{k.rate_limit_rpm} req/m</td>
                <td className="text-muted text-xs">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleTimeString() : 'Never'}
                </td>
                <td>
                  {k.revoked_at ? (
                    <span className="status-pill pill-revoked">Revoked</span>
                  ) : (
                    <span className="status-pill pill-active">Active</span>
                  )}
                </td>
                <td>
                  {!k.revoked_at && (
                    <button
                      className="btn-action btn-danger"
                      onClick={() => onRevokeKey(k.id)}
                      title="Instantly invalidate token across all gateways"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Key Creation */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="apikey-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="apikey-modal-title">{revealedToken ? 'Save Your API Key Token' : 'Generate Scoped API Key'}</h3>
              <button className="btn-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            {revealedToken ? (
              <div className="modal-body">
                <div className="security-alert-box">
                  <p className="font-bold text-amber">⚠️ Important Security Notice</p>
                  <p className="text-xs text-muted">
                    This token is only displayed once. It is stored as a SHA-256 one-way cryptographic hash
                    in the database and cannot be recovered if lost.
                  </p>
                </div>

                <div className="token-reveal-container">
                  <span className="font-mono text-xs token-string">{revealedToken}</span>
                  <button className="btn btn-primary btn-sm" onClick={copyToClipboard}>
                    {copied ? 'Copied! ✓' : 'Copy Secret'}
                  </button>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={closeModal}>
                    I have safely stored this secret
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="modal-body">
                <div className="form-group">
                  <label htmlFor="apikey-name-input">Key Name / Service Description</label>
                  <input
                    id="apikey-name-input"
                    ref={nameInputRef}
                    type="text"
                    placeholder="e.g. Stripe Webhook Ingestion Service"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-control"
                    required
                  />
                </div>

                <fieldset className="form-group">
                  <legend>Assign Permission Scopes</legend>
                  <div className="scope-selection-grid">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label key={scope} className="scope-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        <span>{scope}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="apikey-rpm-input">Rate Limit Quota (RPM)</label>
                    <input
                      id="apikey-rpm-input"
                      type="number"
                      min="5"
                      max="1000"
                      value={rateLimitRpm}
                      onChange={(e) => setRateLimitRpm(e.target.value)}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="apikey-expiry-select">Expiration Period</label>
                    <select
                      id="apikey-expiry-select"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="form-control"
                    >
                      <option value="30">30 Days</option>
                      <option value="90">90 Days</option>
                      <option value="365">1 Year</option>
                      <option value="">Never Expires</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Hashing & Generating...' : 'Create & View Secret'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
