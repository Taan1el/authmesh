import React from 'react';
import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing }) => {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div>
          <h1 className="brand-name">AuthMesh</h1>
          <p className="brand-subtitle">
            Multi-tenant RBAC gateway for Nordic FinTech Labs: scoped API keys, sliding-window rate
            limits, and a cryptographically chained audit log.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>
    </header>
  );
};
