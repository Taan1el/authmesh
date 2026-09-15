import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/index';
import {
  User,
  Role,
  ApiKey,
  AuditEvent,
  TenantSecurityMetrics,
  RoleName,
  CreateUserDto,
  CreateApiKeyDto,
} from '../../shared/types';
import { SecurityMetrics } from './components/SecurityMetrics';
import { PermissionMatrix } from './components/PermissionMatrix';
import { ApiKeyVault } from './components/ApiKeyVault';
import { UserDirectory } from './components/UserDirectory';
import { AuditLedgerFeed } from './components/AuditLedgerFeed';
import { SecuritySandbox } from './components/SecuritySandbox';
import { DemoBanner } from './components/DemoBanner';
import './App.css';

export const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [metrics, setMetrics] = useState<TenantSecurityMetrics>({
    total_users: 0,
    active_api_keys: 0,
    security_score: 0,
    denied_events_24h: 0,
    audit_chain_valid: true,
    mfa_adoption_pct: 0,
  });

  const [activeTab, setActiveTab] = useState<'sandbox' | 'matrix' | 'keys' | 'users' | 'audit'>('sandbox');
  const [isVerifying, setIsVerifying] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [uList, rList, kList, aList, mData] = await Promise.all([
        api.getUsers(),
        api.getRoles(),
        api.getKeys(),
        api.getAudit(50),
        api.getMetrics(),
      ]);

      setUsers(uList);
      setRoles(rList);
      setApiKeys(kList);
      setAuditEvents(aList);
      setMetrics(mData);
    } catch (err: any) {
      console.error('Failed to load AuthMesh state:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      if (res.valid) {
        showToast(`Audit Ledger verified! All ${res.totalBlocks} SHA-256 blocks valid.`);
      } else {
        showToast(`Warning: Blockchain verification failed at block ${res.brokenBlockId}`);
      }
      await loadData();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpdateRole = async (id: string, role: RoleName) => {
    try {
      await api.updateUserRole(id, role);
      showToast(`User role updated to ${role}`);
      await loadData();
    } catch (err: any) {
      alert(`Error updating role: ${err.message}`);
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: 'active' | 'suspended') => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await api.updateUserStatus(id, nextStatus);
      showToast(`User account status updated to ${nextStatus}`);
      await loadData();
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleCreateUser = async (dto: CreateUserDto) => {
    await api.createUser(dto);
    showToast(`Invited ${dto.name} as ${dto.role}`);
    await loadData();
  };

  const handleCreateKey = async (dto: CreateApiKeyDto) => {
    const result = await api.createKey(dto);
    showToast(`Generated API key '${result.name}'`);
    await loadData();
    return result;
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to permanently revoke this API key?')) return;
    await api.revokeKey(id);
    showToast('API key revoked immediately across all gateway nodes');
    await loadData();
  };

  return (
    <div className="app-container">
      <DemoBanner onReset={loadData} />

      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">AM</div>
          <div>
            <h1>AuthMesh</h1>
            <p className="header-subtitle">
              Enterprise Multi-Tenant RBAC Security Gateway & Cryptographically Verified Audit Ledger
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="tenant-badge">
            <span className="tenant-icon">🏢</span>
            <span>Nordic FinTech Labs (Estonia)</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadData}>
            ↻ Sync State
          </button>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && <div className="toast-notification">{notification}</div>}

      <main className="dashboard-content">
        {/* Security Posture KPI Cards */}
        <SecurityMetrics
          metrics={metrics}
          onVerifyChain={handleVerifyChain}
          isVerifying={isVerifying}
        />

        {/* Navigation Tabs */}
        <div className="main-nav-tabs" role="tablist" aria-label="AuthMesh views">
          <button
            id="tab-sandbox"
            role="tab"
            aria-selected={activeTab === 'sandbox'}
            aria-controls="panel-sandbox"
            className={`nav-tab ${activeTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('sandbox')}
          >
            🧪 Interactive Security Sandbox
          </button>
          <button
            id="tab-matrix"
            role="tab"
            aria-selected={activeTab === 'matrix'}
            aria-controls="panel-matrix"
            className={`nav-tab ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            🛡️ RBAC Policy Matrix
          </button>
          <button
            id="tab-keys"
            role="tab"
            aria-selected={activeTab === 'keys'}
            aria-controls="panel-keys"
            className={`nav-tab ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            🔑 API Key Vault
          </button>
          <button
            id="tab-users"
            role="tab"
            aria-selected={activeTab === 'users'}
            aria-controls="panel-users"
            className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 Tenant Identities ({users.length})
          </button>
          <button
            id="tab-audit"
            role="tab"
            aria-selected={activeTab === 'audit'}
            aria-controls="panel-audit"
            className={`nav-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            ⛓️ Immutable Audit Trail ({auditEvents.length})
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'sandbox' && (
          <div className="tab-view-container" id="panel-sandbox" role="tabpanel" aria-labelledby="tab-sandbox">
            <SecuritySandbox
              users={users}
              apiKeys={apiKeys}
              onAuditUpdated={loadData}
            />
            <AuditLedgerFeed
              events={auditEvents.slice(0, 10)}
              onVerifyChain={handleVerifyChain}
              isVerifying={isVerifying}
            />
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="tab-view-container" id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix">
            <PermissionMatrix roles={roles} />
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="tab-view-container" id="panel-keys" role="tabpanel" aria-labelledby="tab-keys">
            <ApiKeyVault
              apiKeys={apiKeys}
              onCreateKey={handleCreateKey}
              onRevokeKey={handleRevokeKey}
            />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="tab-view-container" id="panel-users" role="tabpanel" aria-labelledby="tab-users">
            <UserDirectory
              users={users}
              onUpdateRole={handleUpdateRole}
              onToggleStatus={handleToggleUserStatus}
              onCreateUser={handleCreateUser}
            />
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="tab-view-container" id="panel-audit" role="tabpanel" aria-labelledby="tab-audit">
            <AuditLedgerFeed
              events={auditEvents}
              onVerifyChain={handleVerifyChain}
              isVerifying={isVerifying}
            />
          </div>
        )}
      </main>
    </div>
  );
};
