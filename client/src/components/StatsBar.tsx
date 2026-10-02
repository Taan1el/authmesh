import React from 'react';
import { TenantSecurityMetrics } from '../../../shared/types';

interface StatsBarProps {
  metrics: TenantSecurityMetrics;
}

export const StatsBar: React.FC<StatsBarProps> = ({ metrics }) => {
  return (
    <div className="stats-strip">
      <div className="stat-cell">
        <span className="stat-label">Security score</span>
        <span className="stat-value">{metrics.security_score}</span>
        <span className="stat-note">out of 100</span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Members</span>
        <span className="stat-value">{metrics.total_users}</span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Active API keys</span>
        <span className="stat-value">{metrics.active_api_keys}</span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">MFA adoption</span>
        <span className="stat-value">{metrics.mfa_adoption_pct}%</span>
      </div>

      <div className="stat-cell">
        <span className="stat-label">Denied, 24h</span>
        <span className="stat-value">{metrics.denied_events_24h}</span>
      </div>
    </div>
  );
};
