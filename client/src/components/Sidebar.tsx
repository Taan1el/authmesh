import React from 'react';
import { FlaskConical, GitCompareArrows, KeyRound, Link2, RefreshCw, ScanSearch, Shield, Users } from 'lucide-react';

export type ViewId = 'sandbox' | 'matrix' | 'keys' | 'users' | 'audit' | 'tester' | 'changes';

interface SidebarProps {
  active: ViewId;
  onSelect: (view: ViewId) => void;
  counts: { roles: number; keys: number; members: number; audit?: number };
  /** Views to list, in order. Defaults to all of them. */
  views?: ViewId[];
  /** The organization or workspace name under the product name. */
  tenantLabel?: string;
  /** Hidden when absent, because the score describes the sample organization only. */
  securityScore?: number;
  /** Hidden when absent. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ITEMS: { id: ViewId; label: string; icon: React.ReactNode; count?: keyof SidebarProps['counts'] }[] = [
  { id: 'sandbox', label: 'Sandbox', icon: <FlaskConical size={16} strokeWidth={1.75} aria-hidden="true" /> },
  { id: 'matrix', label: 'Permissions', icon: <Shield size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'roles' },
  { id: 'keys', label: 'API keys', icon: <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'keys' },
  { id: 'users', label: 'Members', icon: <Users size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'members' },
  { id: 'audit', label: 'Audit log', icon: <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />, count: 'audit' },
  { id: 'tester', label: 'Access test', icon: <ScanSearch size={16} strokeWidth={1.75} aria-hidden="true" /> },
  { id: 'changes', label: 'Changes', icon: <GitCompareArrows size={16} strokeWidth={1.75} aria-hidden="true" /> },
];

export const Sidebar: React.FC<SidebarProps> = ({
  active,
  onSelect,
  counts,
  views,
  tenantLabel = 'Nordic FinTech Labs',
  securityScore,
  onRefresh,
  isRefreshing = false,
}) => {
  const items = views ? ITEMS.filter((item) => views.includes(item.id)) : ITEMS;
  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const index = items.findIndex((item) => item.id === active);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(items[next].id);
    document.getElementById(`tab-${items[next].id}`)?.focus();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1 className="brand-name">AuthMesh</h1>
        <p className="brand-tenant">{tenantLabel}</p>
      </div>

      <div className="sidebar-nav" role="tablist" aria-orientation="vertical" aria-label="AuthMesh views" onKeyDown={handleTabKeyDown}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            aria-controls={`panel-${item.id}`}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            {item.icon}
            <span className="nav-label">{item.label}</span>
            {item.count && counts[item.count] !== undefined && <span className="nav-count">{counts[item.count]}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        {securityScore !== undefined && (
          <p className="score-line">
            <span>Security score</span>
            <span className="score-value">{securityScore}</span>
            <span>/ 100</span>
          </p>
        )}
        {onRefresh && (
          <button type="button" className="side-btn" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        )}
        <a className="side-link" href="https://github.com/Taan1el/authmesh" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </div>
    </aside>
  );
};
