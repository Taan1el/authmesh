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
import { Sidebar, ViewId } from './components/Sidebar';
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

  const [activeTab, setActiveTab] = useState<ViewId>('sandbox');
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

  const keyCount = apiKeys.filter((k) => !k.revoked_at).length;

  return (
    <div className="app-shell">
      <DemoBanner onReset={loadData} />

      {notification && <output className="toast">{notification}</output>}

      <div className="console">
        <Sidebar
          active={activeTab}
          onSelect={setActiveTab}
          counts={{ roles: roles.length, keys: keyCount, members: users.length, audit: auditEvents.length }}
          securityScore={metrics.security_score}
          onRefresh={loadData}
          isRefreshing={isRefreshing}
        />

        <main className="console-main">
          {activeTab === 'sandbox' && (
            <div className="view" id="panel-sandbox" role="tabpanel" aria-labelledby="tab-sandbox">
              <SecuritySandbox users={users} apiKeys={apiKeys} onAuditUpdated={loadData} />
              <AuditLedgerFeed
                events={auditEvents.slice(0, 10)}
                onVerifyChain={handleVerifyChain}
                isVerifying={isVerifying}
                chainValid={metrics.audit_chain_valid}
                deniedLast24h={metrics.denied_events_24h}
              />
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="view" id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix">
              <PermissionMatrix roles={roles} />
            </div>
          )}

          {activeTab === 'keys' && (
            <div className="view" id="panel-keys" role="tabpanel" aria-labelledby="tab-keys">
              <ApiKeyVault apiKeys={apiKeys} onCreateKey={handleCreateKey} onRevokeKey={handleRevokeKey} />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="view" id="panel-users" role="tabpanel" aria-labelledby="tab-users">
              <UserDirectory
                users={users}
                mfaAdoptionPct={metrics.mfa_adoption_pct}
                onUpdateRole={handleUpdateRole}
                onToggleStatus={handleToggleUserStatus}
                onCreateUser={handleCreateUser}
              />
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="view" id="panel-audit" role="tabpanel" aria-labelledby="tab-audit">
              <AuditLedgerFeed
                events={auditEvents}
                onVerifyChain={handleVerifyChain}
                isVerifying={isVerifying}
                chainValid={metrics.audit_chain_valid}
                deniedLast24h={metrics.denied_events_24h}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
