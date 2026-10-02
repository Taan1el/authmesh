import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
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
    <section className="panel" aria-labelledby="keys-title">
      <div className="panel-heading">
        <div>
          <h2 id="keys-title">API keys</h2>
          <p className="panel-description">Hashed tokens with scoped permissions and a per-key rate limit.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} aria-hidden="true" />
          Generate key
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Prefix</th>
              <th scope="col">Scopes</th>
              <th scope="col">Rate limit</th>
              <th scope="col">Last used</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}>No API keys yet. Generate one to authenticate a service.</td>
              </tr>
            )}
            {apiKeys.map((k) => (
              <tr key={k.id}>
                <td>
                  <strong>{k.name}</strong>
                </td>
                <td className="cell-mono">{k.key_prefix}</td>
                <td>
                  <div className="scopes-wrap">
                    {k.scopes.map((s) => (
                      <span key={s} className="scope-pill">
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="cell-mono">{k.rate_limit_rpm} req/min</td>
                <td className="muted">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleTimeString() : 'Never'}
                </td>
                <td>
                  {k.revoked_at ? (
                    <span className="status-pill revoked">Revoked</span>
                  ) : (
                    <span className="status-pill active">Active</span>
                  )}
                </td>
                <td>
                  {!k.revoked_at && (
                    <button
                      className="btn-action danger"
                      onClick={() => onRevokeKey(k.id)}
                      title="Invalidate this token immediately"
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
              <h3 id="apikey-modal-title">{revealedToken ? 'Save this key' : 'Generate scoped API key'}</h3>
              <button className="modal-close" onClick={closeModal} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {revealedToken ? (
              <div className="modal-body">
                <p className="notice warn">
                  <AlertTriangle size={16} aria-hidden="true" />
                  This token is shown once. It is stored as a one-way hash and cannot be recovered if lost.
                </p>

                <div className="token-reveal">
                  <span className="token-string">{revealedToken}</span>
                  <button className="btn btn-secondary" onClick={copyToClipboard}>
                    {copied ? 'Copied' : 'Copy token'}
                  </button>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-primary" onClick={closeModal}>
                    I have saved this token
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="modal-body">
                <div className="form-group">
                  <label htmlFor="apikey-name-input">Key name</label>
                  <input
                    id="apikey-name-input"
                    ref={nameInputRef}
                    type="text"
                    placeholder="e.g. Stripe webhook ingestion"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-control"
                    required
                  />
                </div>

                <fieldset className="form-group">
                  <legend>Scopes</legend>
                  <div className="scope-selection-grid">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label key={scope} className="checkbox-field">
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
                    <label htmlFor="apikey-rpm-input">Rate limit (req/min)</label>
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
                    <label htmlFor="apikey-expiry-select">Expires</label>
                    <select
                      id="apikey-expiry-select"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="form-control"
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                      <option value="">Never</option>
                    </select>
                  </div>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating' : 'Create key'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
