import React, { useState, useEffect, useCallback } from 'react';
import { FlaskConical, KeyRound, Link2, Shield, Users } from 'lucide-react';
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
import { StatsBar } from './components/StatsBar';
import { PermissionMatrix } from './components/PermissionMatrix';
import { ApiKeyVault } from './components/ApiKeyVault';
import { UserDirectory } from './components/UserDirectory';
import { AuditLedgerFeed } from './components/AuditLedgerFeed';
import { SecuritySandbox } from './components/SecuritySandbox';
import { DemoBanner } from './components/DemoBanner';
import { Header } from './components/Header';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
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
    } finally {
      setIsRefreshing(false);
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
        showToast(`Audit log verified, all ${res.totalBlocks} blocks valid.`);
      } else {
        showToast(`Chain verification failed at block ${res.brokenBlockId}.`);
      }
      await loadData();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUpdateRole = async (id: string, role: RoleName) => {
    try {
      await api.updateUserRole(id, role);
      showToast(`Role updated to ${role}.`);
      await loadData();
    } catch (err: any) {
      alert(`Error updating role: ${err.message}`);
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: 'active' | 'suspended') => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await api.updateUserStatus(id, nextStatus);
      showToast(`Account status updated to ${nextStatus}.`);
      await loadData();
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleCreateUser = async (dto: CreateUserDto) => {
    await api.createUser(dto);
    showToast(`Invited ${dto.name} as ${dto.role}.`);
    await loadData();
  };

  const handleCreateKey = async (dto: CreateApiKeyDto) => {
    const result = await api.createKey(dto);
    showToast(`Generated API key '${result.name}'.`);
    await loadData();
    return result;
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Revoke this API key? It stops working immediately.')) return;
    await api.revokeKey(id);
    showToast('API key revoked.');
    await loadData();
  };

  return (
    <div className="app-container">
      <DemoBanner onReset={loadData} />

      <Header onRefresh={loadData} isRefreshing={isRefreshing} />

      {notification && <div className="toast" role="status">{notification}</div>}

      <main className="app-main">
        <StatsBar metrics={metrics} />

        <div className="main-nav-tabs" role="tablist" aria-label="AuthMesh views">
          <button
            id="tab-sandbox"
            role="tab"
            aria-selected={activeTab === 'sandbox'}
            aria-controls="panel-sandbox"
            className={`nav-tab ${activeTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('sandbox')}
          >
            <FlaskConical size={16} aria-hidden="true" />
            Sandbox
          </button>
          <button
            id="tab-matrix"
            role="tab"
            aria-selected={activeTab === 'matrix'}
            aria-controls="panel-matrix"
            className={`nav-tab ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Shield size={16} aria-hidden="true" />
            Permissions
          </button>
          <button
            id="tab-keys"
            role="tab"
            aria-selected={activeTab === 'keys'}
            aria-controls="panel-keys"
            className={`nav-tab ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            <KeyRound size={16} aria-hidden="true" />
            API keys
          </button>
          <button
            id="tab-users"
            role="tab"
            aria-selected={activeTab === 'users'}
            aria-controls="panel-users"
            className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={16} aria-hidden="true" />
            Members ({users.length})
          </button>
          <button
            id="tab-audit"
            role="tab"
            aria-selected={activeTab === 'audit'}
            aria-controls="panel-audit"
            className={`nav-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <Link2 size={16} aria-hidden="true" />
            Audit log ({auditEvents.length})
          </button>
        </div>

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
              chainValid={metrics.audit_chain_valid}
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
              chainValid={metrics.audit_chain_valid}
            />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div>AuthMesh &bull; MIT License</div>
        <a href="https://github.com/Taan1el/authmesh" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
};
