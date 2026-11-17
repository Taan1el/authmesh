import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { api, isDemoMode } from './services/index';
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
import { AccessTester } from './components/AccessTester';
import { AuditVerifier } from './components/AuditVerifier';
import { ConfirmDialog } from './components/Dialog';
import { MemberDialog, RoleDialog, withRole } from './components/PolicyEditors';
import { PolicyChanges } from './components/PolicyChanges';
import { PolicyMembers } from './components/PolicyMembers';
import { WorkspaceBar } from './components/WorkspaceBar';
import { downloadFile } from './local/files';
import {
  initializeWorkspace,
  replaceWorkspace,
  startEmptyPolicy,
  subscribeWorkspace,
  updatePolicy,
  workspaceState,
} from './local/policyWorkspace';
import { policyFromSample, type MemberStatus, type Policy, type PolicyRole } from '../../shared/policy-file';
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

  // ---- Workspace (Pages build only): the policy a person designs and keeps in this browser ----
  const workspace = useSyncExternalStore(subscribeWorkspace, workspaceState, workspaceState);
  const inWorkspace = isDemoMode && workspace.mode === 'workspace';
  const [roleDialog, setRoleDialog] = useState<{ role: PolicyRole | null } | null>(null);
  const [memberDialog, setMemberDialog] = useState(false);
  const [pending, setPending] = useState<{ kind: 'role'; name: string } | { kind: 'member'; email: string } | null>(null);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (isDemoMode) void initializeWorkspace().catch(() => undefined);
  }, []);

  const samplePolicy = useMemo(() => policyFromSample(roles, users, 'Nordic FinTech Labs'), [roles, users]);
  const policy: Policy | null = inWorkspace ? workspace.policy : samplePolicy;
  const views: ViewId[] = inWorkspace
    ? ['matrix', 'users', 'audit', 'tester', 'changes']
    : ['sandbox', 'matrix', 'keys', 'users', 'audit', 'tester', 'changes'];
  const tab: ViewId = views.includes(activeTab) ? activeTab : 'matrix';

  const edit = async (change: (current: Policy) => Policy, message?: string) => {
    setEditError('');
    try {
      await updatePolicy(change);
      if (message) showToast(message);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'The change could not be saved.');
    }
  };

  const startWorkspace = (start: () => Promise<void>) => {
    setEditError('');
    start().catch((err: unknown) => setEditError(err instanceof Error ? err.message : 'The workspace could not be started.'));
  };

  const exportAuditLog = async () => {
    // The ledger lists newest first; a log file is easier to read, and verified, oldest first.
    const events = (await api.getAudit(200000)).slice().reverse();
    downloadFile(
      'audit-log.json',
      JSON.stringify({ format: 'authmesh-audit-log', version: 1, events }, null, 2),
      'application/json'
    );
    showToast(`Exported ${events.length} audit entries.`);
  };

  const workspaceEmpty = inWorkspace && !workspace.policy && (
    <section className="panel" aria-labelledby="empty-title">
      <div className="panel-heading">
        <div>
          <h2 id="empty-title">Your workspace is empty</h2>
          <p className="panel-description">
            Start from a policy.json file with Import policy above, from the sample organization, or from nothing. Everything you design is saved in this browser.
          </p>
        </div>
      </div>
      <div className="empty-actions">
        <button type="button" className="btn btn-primary" onClick={() => startWorkspace(() => replaceWorkspace(samplePolicy, samplePolicy))}>
          Start from the sample policy
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => startWorkspace(startEmptyPolicy)}>
          Start with an empty policy
        </button>
      </div>
      {editError && <p role="alert" className="is-bad">{editError}</p>}
    </section>
  );

  // The sample organization keeps its display names; a workspace policy has only role names.
  const matrixRoles = inWorkspace
    ? (policy?.roles ?? []).map((role) => ({
        name: role.name,
        display_name: role.name,
        description: role.description,
        permissions: role.permissions,
      }))
    : roles;
  const workspaceColumns = useMemo(() => {
    const keys = new Set<string>();
    for (const role of policy?.roles ?? []) {
      for (const scope of role.permissions) if (scope !== '*' && !scope.endsWith(':*')) keys.add(scope);
    }
    return [...keys].sort().map((key) => ({ key, label: key }));
  }, [policy]);

  const deleteRoleTarget = pending?.kind === 'role' ? policy?.roles.find((role) => role.name === pending.name) : undefined;
  const deleteRoleMembers = deleteRoleTarget ? (policy?.members.filter((member) => member.role === deleteRoleTarget.name).length ?? 0) : 0;

  return (
    <div className="app-shell">
      {!inWorkspace && <DemoBanner onReset={loadData} />}
      {isDemoMode && <WorkspaceBar samplePolicy={samplePolicy} />}

      {notification && <output className="toast">{notification}</output>}

      <div className="console">
        <Sidebar
          active={tab}
          onSelect={setActiveTab}
          views={views}
          tenantLabel={inWorkspace ? workspace.policy?.tenant || 'Your workspace' : undefined}
          counts={{
            roles: policy?.roles.length ?? 0,
            keys: keyCount,
            members: policy?.members.length ?? 0,
            audit: inWorkspace ? undefined : auditEvents.length,
          }}
          securityScore={inWorkspace ? undefined : metrics.security_score}
          onRefresh={inWorkspace ? undefined : loadData}
          isRefreshing={isRefreshing}
        />

        <main className="console-main">
          {tab === 'sandbox' && (
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

          {tab === 'matrix' && (
            <div className="view" id="panel-matrix" role="tabpanel" aria-labelledby="tab-matrix">
              {workspaceEmpty || (
                <>
                  {editError && inWorkspace && <p role="alert" className="is-bad">{editError}</p>}
                  <PermissionMatrix
                    roles={matrixRoles}
                    columns={inWorkspace ? workspaceColumns : undefined}
                    editing={
                      inWorkspace
                        ? {
                            onAdd: () => { setEditError(''); setRoleDialog({ role: null }); },
                            onEdit: (name) => { setEditError(''); setRoleDialog({ role: policy?.roles.find((role) => role.name === name) ?? null }); },
                            onDelete: (name) => { setEditError(''); setPending({ kind: 'role', name }); },
                          }
                        : undefined
                    }
                  />
                </>
              )}
            </div>
          )}

          {tab === 'keys' && (
            <div className="view" id="panel-keys" role="tabpanel" aria-labelledby="tab-keys">
              <ApiKeyVault apiKeys={apiKeys} onCreateKey={handleCreateKey} onRevokeKey={handleRevokeKey} />
            </div>
          )}

          {tab === 'users' && (
            <div className="view" id="panel-users" role="tabpanel" aria-labelledby="tab-users">
              {inWorkspace ? (
                workspaceEmpty || (policy && (
                  <>
                    {editError && <p role="alert" className="is-bad">{editError}</p>}
                    <PolicyMembers
                      policy={policy}
                      onAdd={() => { setEditError(''); setMemberDialog(true); }}
                      onChangeRole={(email, role) =>
                        void edit(
                          (current) => ({ ...current, members: current.members.map((member) => (member.email === email ? { ...member, role } : member)) }),
                          `Role updated to ${role}.`
                        )
                      }
                      onChangeStatus={(email, status: MemberStatus) =>
                        void edit(
                          (current) => ({ ...current, members: current.members.map((member) => (member.email === email ? { ...member, status } : member)) }),
                          `Account status updated to ${status}.`
                        )
                      }
                      onRemove={(email) => { setEditError(''); setPending({ kind: 'member', email }); }}
                    />
                  </>
                ))
              ) : (
                <UserDirectory
                  users={users}
                  mfaAdoptionPct={metrics.mfa_adoption_pct}
                  onUpdateRole={handleUpdateRole}
                  onToggleStatus={handleToggleUserStatus}
                  onCreateUser={handleCreateUser}
                />
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div className="view" id="panel-audit" role="tabpanel" aria-labelledby="tab-audit">
              {!inWorkspace && (
                <AuditLedgerFeed
                  events={auditEvents}
                  onVerifyChain={handleVerifyChain}
                  isVerifying={isVerifying}
                  chainValid={metrics.audit_chain_valid}
                  deniedLast24h={metrics.denied_events_24h}
                />
              )}
              <AuditVerifier onExportCurrent={isDemoMode && !inWorkspace ? exportAuditLog : undefined} />
            </div>
          )}

          {tab === 'tester' && (
            <div className="view" id="panel-tester" role="tabpanel" aria-labelledby="tab-tester">
              {workspaceEmpty || (policy && (
                <AccessTester
                  key={inWorkspace ? 'workspace' : 'sample'}
                  policy={policy}
                  sourceLabel={inWorkspace ? 'this workspace policy' : 'the sample organization'}
                />
              ))}
            </div>
          )}

          {tab === 'changes' && (
            <div className="view" id="panel-changes" role="tabpanel" aria-labelledby="tab-changes">
              {workspaceEmpty || (policy && (
                <PolicyChanges
                  key={inWorkspace ? 'workspace' : 'sample'}
                  current={policy}
                  currentLabel={inWorkspace ? 'Current workspace' : 'Sample organization'}
                  backup={inWorkspace ? workspace.backup : null}
                  onDownload={downloadFile}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {roleDialog && policy && (
        <RoleDialog
          policy={policy}
          role={roleDialog.role}
          onSave={(role) => updatePolicy((current) => withRole(current, role)).then(() => showToast(`Saved role ${role.name}.`))}
          onClose={() => setRoleDialog(null)}
        />
      )}
      {memberDialog && policy && (
        <MemberDialog
          policy={policy}
          onSave={(member) => updatePolicy((current) => ({ ...current, members: [...current.members, member] })).then(() => showToast(`Added ${member.email}.`))}
          onClose={() => setMemberDialog(false)}
        />
      )}
      {deleteRoleTarget && (
        <ConfirmDialog
          title={`Delete role ${deleteRoleTarget.name}`}
          confirmLabel="Delete role"
          blocked={deleteRoleMembers > 0}
          onClose={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void edit(
              (current) => ({ ...current, roles: current.roles.filter((role) => role.name !== deleteRoleTarget.name) }),
              `Deleted role ${deleteRoleTarget.name}.`
            );
          }}
        >
          {deleteRoleMembers > 0 ? (
            <p>{deleteRoleMembers} {deleteRoleMembers === 1 ? 'member holds' : 'members hold'} this role. Move them to another role first, then delete it.</p>
          ) : (
            <p>This removes the role and its {deleteRoleTarget.permissions.length} {deleteRoleTarget.permissions.length === 1 ? 'scope' : 'scopes'} from the workspace policy.</p>
          )}
        </ConfirmDialog>
      )}
      {pending?.kind === 'member' && (
        <ConfirmDialog
          title="Remove member"
          confirmLabel="Remove member"
          onClose={() => setPending(null)}
          onConfirm={() => {
            const email = pending.email;
            setPending(null);
            void edit((current) => ({ ...current, members: current.members.filter((member) => member.email !== email) }), `Removed ${email}.`);
          }}
        >
          <p>This removes {pending.email} from the workspace policy.</p>
        </ConfirmDialog>
      )}
    </div>
  );
};
