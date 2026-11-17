import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessTester } from '../components/AccessTester';
import { AuditVerifier } from '../components/AuditVerifier';
import { PolicyChanges } from '../components/PolicyChanges';
import { MemberDialog, RoleDialog } from '../components/PolicyEditors';
import { PermissionMatrix } from '../components/PermissionMatrix';
import { PolicyMembers } from '../components/PolicyMembers';
import { Sidebar } from '../components/Sidebar';
import { calculateAuditHash, GENESIS_HASH } from '../services/demoCrypto';
import { serializePolicy, type Policy } from '../../../shared/policy-file';
import type { AuditEvent } from '../../../shared/types';
import { axe } from './axe';

const policy: Policy = {
  tenant: 'Example Org',
  roles: [
    { name: 'owner', description: 'Everything', permissions: ['*'] },
    { name: 'billing', description: 'Money', permissions: ['billing:*', 'users:read'] },
    { name: 'reader', description: 'Read only', permissions: ['users:read'] },
  ],
  members: [
    { email: 'olga@example.test', name: 'Olga Owner', role: 'owner', status: 'active' },
    { email: 'ben@example.test', name: 'Ben Biller', role: 'billing', status: 'active' },
    { email: 'rita@example.test', name: 'Rita Reader', role: 'reader', status: 'active' },
    { email: 'sam@example.test', name: 'Sam Suspended', role: 'owner', status: 'suspended' },
  ],
};

function fileOf(name: string, text: string): File {
  const file = new File([text], name, { type: 'application/json' });
  // jsdom may not implement Blob.text(); the component only needs the text.
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

describe('Access test', () => {
  async function ask(user: ReturnType<typeof userEvent.setup>, who: string, what: string) {
    await user.clear(screen.getByLabelText(/Member email or name|Role name/));
    await user.type(screen.getByLabelText(/Member email or name|Role name/), who);
    await user.clear(screen.getByLabelText('Permission'));
    await user.type(screen.getByLabelText('Permission'), what);
    await user.click(screen.getByRole('button', { name: 'Check access' }));
  }

  it('allows through a wildcard and names the role, the scope and every role that grants it', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    await ask(user, 'ben@example.test', 'billing:write');
    const result = screen.getByRole('status');
    expect(within(result).getByText('Allowed')).toBeInTheDocument();
    expect(result).toHaveTextContent("Authorized via role 'billing'");
    expect(result).toHaveTextContent('billing:*');
    expect(result).toHaveTextContent('Roles that grant billing:write: owner (*), billing (billing:*)');
  });

  it('denies with the exact reason and says when no role grants the permission', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={{ ...policy, roles: policy.roles.filter((role) => role.name !== 'owner'), members: policy.members.filter((member) => member.role !== 'owner') }} sourceLabel="this workspace policy" />);
    await ask(user, 'Rita Reader', 'deploy:execute');
    const result = screen.getByRole('status');
    expect(within(result).getByText('Denied')).toBeInTheDocument();
    expect(result).toHaveTextContent("Role 'reader' lacks permission 'deploy:execute'");
    expect(result).toHaveTextContent('No role in this policy grants deploy:execute.');
  });

  it('denies a suspended member and an unknown member', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    await ask(user, 'sam@example.test', 'users:read');
    expect(screen.getByRole('status')).toHaveTextContent('User account has been suspended');
    await ask(user, 'nobody@example.test', 'users:read');
    expect(screen.getByRole('status')).toHaveTextContent('User not found in tenant organization');
  });

  it('tests a role directly', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    await user.click(screen.getByRole('button', { name: 'Role' }));
    await ask(user, 'reader', 'users:read');
    expect(screen.getByRole('status')).toHaveTextContent("Role 'reader' grants 'users:read' through the scope 'users:read'");
  });

  it('maps a request line to the permission the gateway requires', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    await user.type(screen.getByLabelText(/Member email or name/), 'rita@example.test');
    await user.click(screen.getByRole('button', { name: 'Request' }));
    await user.clear(screen.getByLabelText('Path'));
    await user.type(screen.getByLabelText('Path'), '/api/protected/deploy');
    expect(screen.getByLabelText('Method')).toHaveValue('POST');
    await user.click(screen.getByRole('button', { name: 'Check access' }));
    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('Denied');
    expect(result).toHaveTextContent('deploy:execute (from POST /api/protected/deploy)');
  });

  it('says so when the gateway has no rule for the request, and rejects malformed input', async () => {
    const user = userEvent.setup();
    render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    await user.click(screen.getByRole('button', { name: 'Check access' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a member email or name.');
    await ask(user, 'rita@example.test', 'users:*');
    expect(screen.getByRole('alert')).toHaveTextContent('Wildcards belong in role definitions');
    await ask(user, 'rita@example.test', 'Users Read');
    expect(screen.getByRole('alert')).toHaveTextContent('resource:action');
    await user.click(screen.getByRole('button', { name: 'Request' }));
    await user.clear(screen.getByLabelText('Path'));
    await user.type(screen.getByLabelText('Path'), '/api/health');
    await user.click(screen.getByRole('button', { name: 'Check access' }));
    expect(screen.getByRole('status')).toHaveTextContent('No answer');
    expect(screen.getByRole('status')).toHaveTextContent('no permission rule for GET /api/health');
  });

  it('has no accessibility violations with a result showing', async () => {
    const user = userEvent.setup();
    const { container } = render(<AccessTester policy={policy} sourceLabel="this workspace policy" />);
    expect(await axe(container)).toHaveNoViolations();
    await ask(user, 'ben@example.test', 'billing:write');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Changes', () => {
  const edited: Policy = {
    ...policy,
    roles: policy.roles.map((role) => (role.name === 'reader' ? { ...role, permissions: ['users:read', 'audit:read'] } : role)),
    members: [...policy.members, { email: 'new@example.test', name: 'New', role: 'reader', status: 'active' }],
  };

  it('shows the scopes added and removed and which members gain or lose which permission', () => {
    render(<PolicyChanges current={edited} currentLabel="Current workspace" backup={policy} onDownload={vi.fn()} />);
    const roles = screen.getByRole('region', { name: 'Role changes table' });
    expect(within(roles).getByText('reader')).toBeInTheDocument();
    expect(roles).toHaveTextContent('Added audit:read');
    const access = screen.getByRole('region', { name: 'Access changes table' });
    expect(within(access).getByText('rita@example.test')).toBeInTheDocument();
    expect(access).toHaveTextContent('Added audit:read');
    expect(access).toHaveTextContent('new@example.test');
    expect(screen.getByText(/known permissions/)).toBeInTheDocument();
  });

  it('exports the change review as Markdown', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    render(<PolicyChanges current={edited} currentLabel="Current workspace" backup={policy} onDownload={onDownload} />);
    await user.click(screen.getByRole('button', { name: 'Export as Markdown' }));
    expect(onDownload).toHaveBeenCalledOnce();
    const [name, content, type] = onDownload.mock.calls[0];
    expect(name).toBe('policy-changes.md');
    expect(type).toBe('text/markdown');
    expect(content).toContain('# Access policy change review');
    expect(content).toContain('- Changed role `reader`');
    expect(content).toContain('Scopes added: `audit:read`');
  });

  it('says there is nothing to review when both versions match', () => {
    render(<PolicyChanges current={policy} currentLabel="Current workspace" backup={policy} onDownload={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('No differences');
  });

  it('compares the current policy with a policy file and rejects an invalid one with its path', async () => {
    const user = userEvent.setup();
    render(<PolicyChanges current={policy} currentLabel="Sample organization" backup={null} onDownload={vi.fn()} />);
    expect(screen.getByText('Choose two versions to compare.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Before policy file'), fileOf('bad.json', JSON.stringify({ version: 1, roles: [{ name: 'x', permissions: ['Bad'] }], members: [] })));
    expect(await screen.findByRole('alert')).toHaveTextContent('roles[0].permissions[0]');
    const older: Policy = { ...policy, roles: policy.roles.filter((role) => role.name !== 'billing'), members: policy.members.filter((member) => member.role !== 'billing') };
    await user.upload(screen.getByLabelText('Before policy file'), fileOf('older.json', serializePolicy(older)));
    expect(await screen.findByText(/older.json: 2 roles, 3 members/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Role changes table' })).toHaveTextContent('billing');
  });

  it('labels and focuses every table that can scroll sideways', () => {
    const { container } = render(<PolicyChanges current={edited} currentLabel="Current workspace" backup={policy} onDownload={vi.fn()} />);
    const wrappers = container.querySelectorAll('.table-wrapper');
    expect(wrappers.length).toBe(2);
    wrappers.forEach((el) => {
      expect(el).toHaveAttribute('role', 'region');
      expect(el).toHaveAttribute('tabindex', '0');
      expect(el.getAttribute('aria-label')?.trim()).toBeTruthy();
    });
  });

  it('has no accessibility violations with a difference showing', async () => {
    const { container } = render(<PolicyChanges current={edited} currentLabel="Current workspace" backup={policy} onDownload={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

function buildLog(count: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < count; i += 1) {
    const base = {
      actor_id: `actor-${i % 3}`,
      action: i % 2 ? 'billing.access' : 'access.forbidden',
      resource: 'billing',
      status: i % 2 ? ('granted' as const) : ('denied' as const),
      created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      details: JSON.stringify({ n: i }),
    };
    const hash = calculateAuditHash({ prev_hash: prev, ...base });
    events.push({ id: `evt-${i}`, actor_type: 'user', actor_name: `Person ${i % 3}`, ip_address: '127.0.0.1', user_agent: 'test', prev_hash: prev, hash, ...base });
    prev = hash;
  }
  return events;
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Audit log JSON'), { target: { value: text } });
}

describe('Audit log verifier', () => {
  it('verifies an intact pasted log', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    paste(JSON.stringify(buildLog(4)));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('status')).toHaveTextContent('Chain intact: 4 entries in Pasted log verified, oldest first.');
  });

  it('points at the entry whose content was changed', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    const log = buildLog(6);
    log[3] = { ...log[3], status: 'granted', action: 'access.forbidden' };
    paste(JSON.stringify({ events: log }));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('status')).toHaveTextContent('Chain broken at entry 4 of 6');
    expect(screen.getByRole('status')).toHaveTextContent('changed after it was written');
    expect(screen.getByText('First broken entry')).toBeInTheDocument();
  });

  it('points at the first entry that was moved', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    const log = buildLog(8);
    [log[4], log[5]] = [log[5], log[4]];
    paste(JSON.stringify(log));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('status')).toHaveTextContent('Chain broken at entry 5 of 8');
    expect(screen.getByRole('status')).toHaveTextContent('moved here');
  });

  it('opens a log file and shows every entry on pages instead of stopping at 100', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    await user.upload(screen.getByLabelText(/Open log file/), fileOf('log.json', JSON.stringify(buildLog(130))));
    expect(await screen.findByText(/Chain intact: 130 entries in log.json/)).toBeInTheDocument();
    const table = () => screen.getByRole('region', { name: 'Verified audit entries table' });
    expect(within(table()).getAllByRole('row')).toHaveLength(26);
    expect(screen.getByText(/Page 1 of 6, 130 entries/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    for (let i = 0; i < 5; i += 1) await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText(/Page 6 of 6/)).toBeInTheDocument();
    expect(within(table()).getAllByRole('row')).toHaveLength(6);
    expect(within(table()).getByText('130')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('jumps to the page that holds the first broken entry', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    const log = buildLog(130);
    log[100] = { ...log[100], resource: 'users' };
    await user.upload(screen.getByLabelText(/Open log file/), fileOf('log.json', JSON.stringify(log)));
    await user.click(await screen.findByRole('button', { name: 'Show the first broken entry' }));
    expect(screen.getByText(/Page 5 of 6/)).toBeInTheDocument();
    expect(screen.getByText('First broken entry')).toBeInTheDocument();
  });

  it('accepts a newest-first log and an excerpt only when told it is one', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    paste(JSON.stringify(buildLog(6).reverse()));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('status')).toHaveTextContent('newest first');
    paste(JSON.stringify(buildLog(8).slice(3)));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('status')).toHaveTextContent('Chain broken at entry 1 of 5');
    await user.click(screen.getByLabelText('This file is an excerpt'));
    expect(screen.getByRole('status')).toHaveTextContent('Chain intact: 5 entries');
  });

  it('names the path of a malformed entry and says nothing was verified', async () => {
    const user = userEvent.setup();
    render(<AuditVerifier />);
    paste(JSON.stringify([{ id: 'x' }]));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This file cannot be verified.');
    expect(alert).toHaveTextContent('events[0].hash');
    expect(screen.queryByRole('region', { name: 'Verified audit entries table' })).not.toBeInTheDocument();
    paste('not json');
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(screen.getByRole('alert')).toHaveTextContent('expected JSON text');
  });

  it('labels and focuses the entries table', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuditVerifier />);
    paste(JSON.stringify(buildLog(3)));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    const wrapper = container.querySelector('.table-wrapper');
    expect(wrapper).toHaveAttribute('role', 'region');
    expect(wrapper).toHaveAttribute('tabindex', '0');
    expect(wrapper?.getAttribute('aria-label')).toBe('Verified audit entries table');
  });

  it('offers to export the current log only when given a handler', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<AuditVerifier />);
    expect(screen.queryByRole('button', { name: 'Export current log' })).not.toBeInTheDocument();
    rerender(<AuditVerifier onExportCurrent={onExport} />);
    await user.click(screen.getByRole('button', { name: 'Export current log' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations with a broken chain showing', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuditVerifier onExportCurrent={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
    const log = buildLog(30);
    log[7] = { ...log[7], status: 'granted', action: 'access.forbidden' };
    paste(JSON.stringify(log));
    await user.click(screen.getByRole('button', { name: 'Verify pasted log' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Role and member dialogs', () => {
  it('previews who gains access while a role is edited and saves sorted scopes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RoleDialog policy={policy} role={policy.roles[2]} onSave={onSave} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Edit role reader' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByText('No differences. Both versions grant the same access to the same members.')).toBeInTheDocument();

    const field = screen.getByLabelText('Permissions');
    await user.clear(field);
    await user.type(field, 'users:read{Enter}audit:read');
    const preview = screen.getByRole('region', { name: 'What this change does' });
    expect(preview).toHaveTextContent('Added audit:read');
    expect(within(preview).getByText('rita@example.test')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save role' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'reader', description: 'Read only', permissions: ['audit:read', 'users:read'] });
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses invalid permissions and duplicate role names, naming the problem', async () => {
    const user = userEvent.setup();
    render(<RoleDialog policy={policy} role={null} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'reader');
    expect(screen.getByRole('alert')).toHaveTextContent('a role named reader already exists');
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'auditor');
    await user.type(screen.getByLabelText('Permissions'), 'Audit:Read');
    expect(screen.getByRole('alert')).toHaveTextContent('"Audit:Read" is not valid');
    expect(screen.getByRole('button', { name: 'Add role' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Permissions'));
    await user.type(screen.getByLabelText('Permissions'), 'audit:*');
    expect(screen.getByRole('button', { name: 'Add role' })).toBeEnabled();
  });

  it('keeps focus in the dialog, closes on Escape and has no accessibility violations', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<RoleDialog policy={policy} role={policy.roles[2]} onSave={vi.fn()} onClose={onClose} />);
    expect(screen.getByLabelText('Permissions')).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('adds a member with a role from the policy and rejects a duplicate email', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<MemberDialog policy={policy} onSave={onSave} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Email'), 'RITA@example.test');
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A member with this email already exists.');
    expect(onSave).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'new@example.test');
    await user.selectOptions(screen.getByLabelText('Role'), 'reader');
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    expect(onSave).toHaveBeenCalledWith({ email: 'new@example.test', name: '', role: 'reader', status: 'active' });
  });
});

describe('Workspace tables', () => {
  it('lists roles with scopes and edit and delete actions, and has no accessibility violations', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const roles = policy.roles.map((role) => ({ name: role.name, display_name: role.name, description: role.description, permissions: role.permissions }));
    const { container } = render(
      <PermissionMatrix
        roles={roles}
        columns={[{ key: 'billing:read', label: 'billing:read' }, { key: 'users:read', label: 'users:read' }]}
        editing={{ onAdd: vi.fn(), onEdit, onDelete }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Edit role billing' }));
    expect(onEdit).toHaveBeenCalledWith('billing');
    await user.click(screen.getByRole('button', { name: 'Delete role reader' }));
    expect(onDelete).toHaveBeenCalledWith('reader');
    expect(screen.getByRole('columnheader', { name: 'users:read' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lets members change role and status and has no accessibility violations', async () => {
    const user = userEvent.setup();
    const onChangeRole = vi.fn();
    const onChangeStatus = vi.fn();
    const { container } = render(<PolicyMembers policy={policy} onAdd={vi.fn()} onChangeRole={onChangeRole} onChangeStatus={onChangeStatus} onRemove={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Role for rita@example.test'), 'billing');
    expect(onChangeRole).toHaveBeenCalledWith('rita@example.test', 'billing');
    await user.click(screen.getByRole('button', { name: 'Reactivate sam@example.test' }));
    expect(onChangeStatus).toHaveBeenCalledWith('sam@example.test', 'active');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Sidebar views', () => {
  it('lists only the views it is given and keeps the arrow, Home and End keys working over them', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Sidebar active="matrix" onSelect={onSelect} views={['matrix', 'users', 'tester']} counts={{ roles: 3, keys: 0, members: 4 }} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Permissions3', 'Members4', 'Access test']);
    expect(screen.queryByText('Security score')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
    tabs[0].focus();
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('tester');
    await user.keyboard('{ArrowUp}');
    expect(onSelect).toHaveBeenLastCalledWith('tester');
  });
});
