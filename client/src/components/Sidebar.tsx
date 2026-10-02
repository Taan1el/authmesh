import React from 'react';
import { FlaskConical, KeyRound, Link2, RefreshCw, Shield, Users } from 'lucide-react';

export type ViewId = 'sandbox' | 'matrix' | 'keys' | 'users' | 'audit';

interface SidebarProps {
  active: ViewId;
  onSelect: (view: ViewId) => void;
  counts: { roles: number; keys: number; members: number; audit: number };
  securityScore: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const ITEMS: { id: ViewId; label: string; icon: React.ReactNode; count?: keyof SidebarProps['counts'] }[] = [
  { id: 'sandbox', label: 'Sandbox', icon: <FlaskConical size={16} strokeWidth={1.75} aria-hidden="true" /> },
  { id: 'matrix', label: 'Permissions', icon: <Shield size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'roles' },
  { id: 'keys', label: 'API keys', icon: <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'keys' },
  { id: 'users', label: 'Members', icon: <Users size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'members' },
  { id: 'audit', label: 'Audit log', icon: <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'audit' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  onSelect,
  counts,
  securityScore,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1 className="brand-name">AuthMesh</h1>
        <p className="brand-tenant">Nordic FinTech Labs</p>
      </div>

      <div className="sidebar-nav" role="tablist" aria-orientation="vertical" aria-label="AuthMesh views">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            aria-controls={`panel-${item.id}`}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.icon}
            <span className="nav-label">{item.label}</span>
            {item.count && <span className="nav-count">{counts[item.count]}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <p className="score-line">
          <span>Security score</span>
          <span className="score-value">{securityScore}</span>
          <span>/ 100</span>
        </p>
        <button type="button" className="side-btn" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          {isRefreshing ? 'Refreshing' : 'Refresh'}
        </button>
        <a className="side-link" href="https://github.com/Taan1el/authmesh" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </aside>
  );
};
