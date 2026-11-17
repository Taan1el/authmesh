// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Policy } from '../../../shared/policy-file.js';

const policy: Policy = {
  tenant: 'Example Org',
  roles: [
    { name: 'admin', description: '', permissions: ['users:*'] },
    { name: 'reader', description: '', permissions: ['users:read'] },
  ],
  members: [{ email: 'ada@example.test', name: 'Ada', role: 'admin', status: 'active' }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
});

async function load() {
  const store = await import('../local/policyWorkspace.js');
  await store.initializeWorkspace();
  return store;
}

describe('policy workspace store', () => {
  it('starts in sample mode with no policy', async () => {
    const store = await load();
    expect(store.workspaceState()).toMatchObject({ ready: true, mode: 'sample', policy: null, unbacked: false });
  });

  it('keeps the policy, the baseline and the mode after a fresh module load', async () => {
    let store = await load();
    await store.replaceWorkspace(policy, policy);
    expect(store.workspaceState()).toMatchObject({ mode: 'workspace', unbacked: false });
    await store.updatePolicy((current) => ({ ...current, roles: current.roles.filter((role) => role.name !== 'reader') }));
    expect(store.workspaceState().unbacked).toBe(true);
    store.stopWorkspaceListening();

    vi.resetModules();
    store = await load();
    const state = store.workspaceState();
    expect(state.mode).toBe('workspace');
    expect(state.policy?.roles.map((role) => role.name)).toEqual(['admin']);
    expect(state.backup?.roles.map((role) => role.name)).toEqual(['admin', 'reader']);
    expect(state.unbacked).toBe(true);
  });

  it('clears the backup reminder once the policy is marked as backed up', async () => {
    const store = await load();
    await store.replaceWorkspace(policy, null);
    expect(store.workspaceState().unbacked).toBe(true);
    await store.markBackedUp();
    expect(store.workspaceState().unbacked).toBe(false);
    await store.updatePolicy((current) => ({ ...current, tenant: 'Renamed' }));
    expect(store.workspaceState().unbacked).toBe(true);
  });

  it('does not nag about an empty policy that was never exported', async () => {
    const store = await load();
    await store.startEmptyPolicy();
    expect(store.workspaceState()).toMatchObject({ mode: 'workspace', unbacked: false });
  });

  it('switches mode without touching the saved policy', async () => {
    const store = await load();
    await store.replaceWorkspace(policy, policy);
    await store.chooseWorkspaceMode('sample');
    expect(store.workspaceState().mode).toBe('sample');
    expect(store.workspaceState().policy?.tenant).toBe('Example Org');
  });

  it('removes the workspace and returns to an empty state', async () => {
    const store = await load();
    await store.replaceWorkspace(policy, policy);
    await store.removeWorkspace();
    expect(store.workspaceState().policy).toBeNull();
    vi.resetModules();
    const again = await load();
    expect(again.workspaceState().policy).toBeNull();
  });

  it('refuses to edit before a workspace exists', async () => {
    const store = await load();
    await expect(store.updatePolicy((current) => current)).rejects.toThrow(/no workspace yet/);
  });

  it('picks up a change saved by another tab and says so', async () => {
    const tabA = await load();
    await tabA.replaceWorkspace(policy, policy);
    vi.resetModules();
    const tabB = await load();
    await tabB.updatePolicy((current) => ({ ...current, tenant: 'Changed in tab B' }));
    await vi.waitFor(() => expect(tabA.workspaceState().policy?.tenant).toBe('Changed in tab B'));
    expect(tabA.workspaceState().notice).toMatch(/Another tab changed this workspace/);
    tabA.dismissNotice();
    expect(tabA.workspaceState().notice).toBe('');
    tabA.stopWorkspaceListening();
    tabB.stopWorkspaceListening();
  });

  it('refuses a stale edit, shows the latest saved version and says the change was not saved', async () => {
    const tabA = await load();
    await tabA.replaceWorkspace(policy, policy);
    tabA.stopWorkspaceListening();
    vi.resetModules();
    const tabB = await load();
    await tabB.updatePolicy((current) => ({ ...current, tenant: 'Saved by tab B' }));
    tabB.stopWorkspaceListening();

    await expect(tabA.updatePolicy((current) => ({ ...current, tenant: 'Stale edit' }))).rejects.toThrow(/changed in another tab/);
    expect(tabA.workspaceState().policy?.tenant).toBe('Saved by tab B');
    // The refused edit is gone and the next one applies to the latest version.
    await tabA.updatePolicy((current) => ({ ...current, tenant: 'Now current' }));
    expect(tabA.workspaceState().policy?.tenant).toBe('Now current');
  });

  it('reports a saved policy that no longer passes validation and lets an import replace it', async () => {
    const store = await load();
    await store.replaceWorkspace(policy, policy);
    store.stopWorkspaceListening();
    // Corrupt the stored policy by hand: a member with a role the file does not define.
    const storage = await import('../local/workspace.js');
    const saved = await storage.loadWorkspace<{ policy: { members: { role: string }[] } }>();
    saved!.data.policy.members[0].role = 'ghost';
    await storage.saveWorkspace(saved!.data, { expectedRevision: saved!.revision });

    vi.resetModules();
    const fresh = await import('../local/policyWorkspace.js');
    await expect(fresh.initializeWorkspace()).rejects.toThrow(/cannot be read.*members\[0\]\.role/);
    await fresh.replaceWorkspace(policy, policy);
    expect(fresh.workspaceState().policy?.members[0].role).toBe('admin');
    fresh.stopWorkspaceListening();
  });
});
