import React from 'react';
import { TenantSecurityMetrics } from '../../../shared/types';

interface SecurityMetricsProps {
  metrics: TenantSecurityMetrics;
  onVerifyChain: () => void;
  isVerifying: boolean;
}

export const SecurityMetrics: React.FC<SecurityMetricsProps> = ({
  metrics,
  onVerifyChain,
  isVerifying,
}) => {
  return (
    <div className="metrics-grid">
      <div className="metric-card score-card">
        <span className="metric-label">Security Posture Score</span>
        <div className="score-display">
          <span
            className={`metric-value ${
              metrics.security_score >= 80
                ? 'text-success'
                : metrics.security_score >= 60
                ? 'text-warning'
                : 'text-danger'
            }`}
          >
            {metrics.security_score}
            <span className="text-sm font-normal text-muted">/100</span>
          </span>
          <span className="score-grade">
            {metrics.security_score >= 90 ? 'Grade A+' : metrics.security_score >= 75 ? 'Grade B' : 'Needs Review'}
          </span>
        </div>
        <span className="metric-sub">Zero-trust baseline compliance</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Tenant Members</span>
        <span className="metric-value text-accent">{metrics.total_users}</span>
        <span className="metric-sub">Active identities</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Active API Keys</span>
        <span className="metric-value text-purple">{metrics.active_api_keys}</span>
        <span className="metric-sub">Cryptographically hashed tokens</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">MFA Adoption</span>
        <span className="metric-value text-success">{metrics.mfa_adoption_pct}%</span>
        <span className="metric-sub">Hardware & TOTP auth</span>
      </div>

      <div className="metric-card">
        <span className="metric-label">Denied Violations (24h)</span>
        <span
          className={`metric-value ${
            metrics.denied_events_24h > 0 ? 'text-warning' : 'text-muted'
          }`}
        >
          {metrics.denied_events_24h}
        </span>
        <span className="metric-sub">RBAC & rate limit blocks</span>
      </div>

      <div className="metric-card chain-card">
        <span className="metric-label">Immutable Audit Chain</span>
        <div className="chain-status">
          <span
            className={`chain-pill ${
              metrics.audit_chain_valid ? 'chain-valid' : 'chain-invalid'
            }`}
          >
            {metrics.audit_chain_valid ? '✓ Verified Hash Chain' : '⚠️ Tampering Detected'}
          </span>
        </div>
        <button
          className="btn btn-secondary btn-xs mt-2"
          onClick={onVerifyChain}
          disabled={isVerifying}
        >
          {isVerifying ? 'Verifying SHA-256...' : 'Re-verify Ledger'}
        </button>
      </div>
    </div>
  );
};
