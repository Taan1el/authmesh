import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parsePolicyText, serializePolicy, type Policy } from '../../../shared/policy-file';
import { axe } from './axe';

const downloadFile = vi.fn();
vi.mock('../local/files.js', () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));
vi.mock('../local/files', () => ({ downloadFile: (...args: unknown[]) => downloadFile(...args) }));

const saved: Policy = {
  tenant: 'Saved Org',
  roles: [{ name: 'admin', description: '', permissions: ['*'] }],
  members: [{ email: 'old@example.test', name: 'Old', role: 'admin', status: 'active' }],
};

const incoming: Policy = {
  tenant: 'Incoming Org',
  roles: [
    { name: 'admin', description: '', permissions: ['*'] },
    { name: 'guest', description: '', permissions: ['docs:read'] },
  ],
  members: [
    { email: 'a@example.test', name: '', role: 'admin', status: 'active' },
    { email: 'b@example.test', name: '', role: 'guest', status: 'active' },
    { email: 'c@example.test', name: '', role: 'guest', status: 'suspended' },
  ],
};

function fileOf(name: string, text: string): File {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  downloadFile.mockReset();
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
});

afterEach(() => cleanup());

async function renderBar() {
  const store = await import('../local/policyWorkspace');
  const { WorkspaceBar } = await import('../components/WorkspaceBar');
  const user = userEvent.setup();
  const view = render(<WorkspaceBar samplePolicy={incoming} />);
  await store.initializeWorkspace();
  return { store, user, view };
}

describe('Workspace bar import', () => {
  it('states the counts of the file and creates the workspace when none is saved', async () => {
    const { store, user } = await renderBar();
    await user.click(screen.getByRole('button', { name: 'Import policy' }));
    const dialog = screen.getByRole('dialog', { name: 'Import policy file' });
    await user.upload(within(dialog).getByLabelText('Policy file'), fileOf('policy.json', serializePolicy(incoming)));
    expect(await within(dialog).findByText(/is valid: 2 roles and 3 members/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Importing creates your workspace from it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import into workspace' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(store.workspaceState()).toMatchObject({ mode: 'workspace', unbacked: false });
    expect(store.workspaceState().policy?.roles).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Imported 2 roles and 3 members into your workspace.');
  });

  it('states what a saved workspace holds before replacing it, and replaces nothing on cancel', async () => {
    const { store, user } = await renderBar();
    await store.replaceWorkspace(saved, saved);
    await user.click(screen.getByRole('button', { name: 'Import policy' }));
    const dialog = screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Policy file'), fileOf('policy.json', serializePolicy(incoming)));
    expect(await within(dialog).findByText(/replaces your saved workspace \(1 role and 1 member\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/is valid: 2 roles and 3 members/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(store.workspaceState().policy?.tenant).toBe('Saved Org');

    await user.click(screen.getByRole('button', { name: 'Import policy' }));
    await user.upload(within(screen.getByRole('dialog')).getByLabelText('Policy file'), fileOf('policy.json', serializePolicy(incoming)));
    await user.click(await screen.findByRole('button', { name: 'Replace workspace' }));
    await waitFor(() => expect(store.workspaceState().policy?.tenant).toBe('Incoming Org'));
  });

  it('keeps the confirm button disabled and names the path for an invalid file', async () => {
    const { store, user } = await renderBar();
    await store.replaceWorkspace(saved, saved);
    await user.click(screen.getByRole('button', { name: 'Import policy' }));
    const dialog = screen.getByRole('dialog');
    const bad = JSON.stringify({ version: 1, roles: [{ name: 'admin', permissions: ['Docs:Read'] }], members: [{ email: 'x@example.test', role: 'ghost' }] });
    await user.upload(within(dialog).getByLabelText('Policy file'), fileOf('bad.json', bad));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('roles[0].permissions[0]: expected "*", "resource:*" or "resource:action"');
    expect(alert).toHaveTextContent('members[0].role: expected one of admin, got "ghost"');
    expect(alert).toHaveTextContent('Nothing was changed.');
    expect(within(dialog).getByRole('button', { name: 'Replace workspace' })).toBeDisabled();
    expect(store.workspaceState().policy?.tenant).toBe('Saved Org');
  });

  it('moves focus into the dialog, traps Tab, closes on Escape and returns focus to the button', async () => {
    const { user } = await renderBar();
    const opener = screen.getByRole('button', { name: 'Import policy' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Policy file')).toHaveFocus();
    for (let i = 0; i < 6; i += 1) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('has no accessibility violations with the import dialog open and a file chosen', async () => {
    const { user, view } = await renderBar();
    expect(await axe(view.container)).toHaveNoViolations();
    await user.click(screen.getByRole('button', { name: 'Import policy' }));
    await user.upload(screen.getByLabelText('Policy file'), fileOf('policy.json', serializePolicy(incoming)));
    await screen.findByText(/is valid/);
    expect(await axe(view.container)).toHaveNoViolations();
  });
});

describe('Workspace bar export and backup reminder', () => {
  it('exports the workspace as a policy file and clears the reminder', async () => {
    const { store, user } = await renderBar();
    await store.replaceWorkspace(saved, null);
    expect(await screen.findByText(/Changes are saved in this browser only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export policy' }));
    expect(downloadFile).toHaveBeenCalledOnce();
    const [name, content, type] = downloadFile.mock.calls[0];
    expect(name).toBe('policy.json');
    expect(type).toBe('application/json');
    const parsed = parsePolicyText(content as string);
    expect(parsed.ok && parsed.policy.members[0].email).toBe('old@example.test');
    await waitFor(() => expect(screen.queryByText(/Changes are saved in this browser only/)).not.toBeInTheDocument());
    expect(store.workspaceState().unbacked).toBe(false);
  });

  it('shows the honest status line and asks before clearing the workspace', async () => {
    const { store, user } = await renderBar();
    expect(screen.getByText(/Your data stays in this browser: nothing is uploaded\. This page designs and tests an access policy\. It does not protect a live API\./)).toBeInTheDocument();
    await store.replaceWorkspace(saved, saved);
    await user.click(await screen.findByRole('button', { name: 'Clear workspace' }));
    expect(screen.getByRole('dialog', { name: 'Clear workspace' })).toHaveTextContent('removes 1 role and 1 member from this browser');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.workspaceState().policy).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear workspace' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear workspace' }));
    await waitFor(() => expect(store.workspaceState().policy).toBeNull());
  });
});

describe('Console in the Pages build', () => {
  async function renderApp() {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const { App } = await import('../App');
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole('tab', { name: /Members\s*\d/ });
    return { user, view };
  }

  it('shows the sample organization first, with every sample view and the new tools', async () => {
    await renderApp();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual([
      'Sandbox', 'Permissions', 'API keys', 'Members', 'Audit log', 'Access test', 'Changes',
    ]);
    expect(screen.getByLabelText('Data source')).toHaveValue('sample');
    expect(screen.getByText(/everything runs in your browser with sample data/i)).toBeInTheDocument();
  });

  it('switches to the workspace, starts from the sample policy, edits a role and shows the backup reminder', async () => {
    const { user, view } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Data source'), 'workspace');
    expect(screen.queryByRole('tab', { name: /^Sandbox/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^API keys/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Permissions/ }));
    expect(await screen.findByRole('heading', { name: 'Your workspace is empty' })).toBeInTheDocument();
    expect(await axe(view.container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Start from the sample policy' }));
    expect(await screen.findByRole('button', { name: 'Edit role developer' })).toBeInTheDocument();
    expect(screen.queryByText(/Changes are saved in this browser only/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit role developer' }));
    const field = screen.getByLabelText('Permissions');
    await user.type(field, '{Enter}audit:read');
    expect(screen.getByRole('region', { name: 'What this change does' })).toHaveTextContent('Added audit:read');
    await user.click(screen.getByRole('button', { name: 'Save role' }));
    expect(await screen.findByText('Saved role developer.')).toBeInTheDocument();
    expect(await screen.findByText(/Changes are saved in this browser only/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Changes/ }));
    expect(screen.getByRole('region', { name: 'Role changes table' })).toHaveTextContent('developer');
    expect(screen.getByRole('region', { name: 'Access changes table' })).toHaveTextContent('audit:read');

    await user.click(screen.getByRole('tab', { name: /^Members/ }));
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('refuses to delete a role that members still hold', async () => {
    const { user } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Data source'), 'workspace');
    await user.click(screen.getByRole('tab', { name: /^Permissions/ }));
    await user.click(await screen.findByRole('button', { name: 'Start from the sample policy' }));
    await user.click(await screen.findByRole('button', { name: 'Delete role developer' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete role developer' });
    expect(dialog).toHaveTextContent('Move them to another role first');
    expect(within(dialog).queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(screen.getByRole('button', { name: 'Delete role developer' })).toHaveFocus();
  });

  it('tests access against the workspace policy', async () => {
    const { user } = await renderApp();
    await user.selectOptions(screen.getByLabelText('Data source'), 'workspace');
    await user.click(screen.getByRole('tab', { name: /^Access test/ }));
    await user.click(await screen.findByRole('button', { name: 'Start from the sample policy' }));
    await user.type(await screen.findByLabelText(/Member email or name/), 'maria.kukk@nordicfintech.ee');
    await user.type(screen.getByLabelText('Permission'), 'deploy:execute');
    await user.click(screen.getByRole('button', { name: 'Check access' }));
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText("Role 'billing_manager' lacks permission 'deploy:execute'")).toBeInTheDocument();
  });
});
