import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { axe } from './axe';
import { User, Role, ApiKey, AuditEvent, TenantSecurityMetrics } from '../../../shared/types';

const users: User[] = [
  { id: 'u-1', email: 'laura.tamm@nordicfintech.ee', name: 'Laura Tamm', role: 'owner', status: 'active', mfa_enabled: true, last_login_at: '2026-09-10T12:00:00Z', created_at: '2026-09-10T10:00:00Z' },
  { id: 'u-2', email: 'sander.sepp@nordicfintech.ee', name: 'Sander Sepp', role: 'developer', status: 'suspended', mfa_enabled: false, last_login_at: '2026-09-10T12:00:00Z', created_at: '2026-09-10T10:00:00Z' },
];
const roles: Role[] = [
  { name: 'owner', display_name: 'Organization Owner', description: 'Full root authority', permissions: ['*'], is_system: true },
  { name: 'developer', display_name: 'Software Engineer', description: 'Developer services', permissions: ['users:read', 'keys:read', 'deploy:execute'], is_system: true },
];
const keys: ApiKey[] = [
  { id: 'key-1', name: 'CI/CD Deployment Token', key_prefix: 'am_live_ci_c...mock', scopes: ['deploy:read', 'deploy:execute'], created_by: 'u-2', rate_limit_rpm: 120, created_at: '2026-09-10T10:00:00Z' },
  { id: 'key-2', name: 'Old Token', key_prefix: 'am_live_ol_d...mock', scopes: ['users:read'], created_by: 'u-1', rate_limit_rpm: 60, created_at: '2026-09-10T10:00:00Z', revoked_at: '2026-09-11T10:00:00Z' },
];
const audit: AuditEvent[] = [
  { id: 'aud-1', actor_type: 'user', actor_id: 'u-1', actor_name: 'Laura Tamm', action: 'tenant.initialized', resource: 'system', status: 'granted', ip_address: '82.131.44.12', user_agent: 'Mozilla/5.0', details: JSON.stringify({ note: 'genesis' }), prev_hash: '0'.repeat(64), hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0', created_at: '2026-09-10T10:00:00Z' },
  { id: 'aud-2', actor_type: 'api_key', actor_id: 'key-1', actor_name: 'CI/CD Deployment Token', action: 'users:read', resource: '/users', status: 'denied', ip_address: '82.131.44.13', user_agent: 'curl', details: '{}', prev_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0', hash: 'b1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0', created_at: '2026-09-10T10:05:00Z' },
];
const metrics: TenantSecurityMetrics = { total_users: 2, active_api_keys: 1, security_score: 95, denied_events_24h: 1, audit_chain_valid: true, mfa_adoption_pct: 50 };

const respond = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });

async function renderApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByRole('tab', { name: /Members\s*2/ });
  return { user, container: view.container };
}

describe('Accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/users')) return respond(users);
        if (url.includes('/api/roles')) return respond(roles);
        if (url.includes('/api/keys')) return respond(keys);
        if (url.includes('/api/audit')) return respond(audit);
        if (url.includes('/api/metrics')) return respond(metrics);
        return respond({ valid: true, totalBlocks: 2 });
      })
    );
  });

  it('reports real problems, so a pass means something', async () => {
    const { container } = render(<input type="text" />);
    await expect(axe(container)).resolves.not.toHaveNoViolations();
  });

  const views: [string, RegExp][] = [
    ['Sandbox', /^Sandbox/],
    ['Permissions', /^Permissions/],
    ['API keys', /^API keys/],
    ['Members', /^Members/],
    ['Audit log', /^Audit log/],
  ];

  it.each(views)('has no violations on the %s view', async (_label, name) => {
    const { user, container } = await renderApp();
    await user.click(screen.getByRole('tab', { name }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the create-key dialog', async () => {
    const { user, container } = await renderApp();
    await user.click(screen.getByRole('tab', { name: /^API keys/ }));
    await user.click(screen.getByRole('button', { name: /Generate key/i }));
    await screen.findByRole('dialog', { name: /Generate scoped API key/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations in the invite-member dialog', async () => {
    const { user, container } = await renderApp();
    await user.click(screen.getByRole('tab', { name: /^Members/ }));
    await user.click(screen.getByRole('button', { name: /Invite/i }));
    await screen.findByRole('dialog', { name: /Invite member/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('sidebar tabs keyboard pattern', () => {
    const selectedName = () => screen.getByRole('tab', { selected: true }).textContent;

    it('uses a roving tabindex', async () => {
      await renderApp();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
      expect(tabs[0]).toHaveAttribute('tabindex', '0');
      tabs.slice(1).forEach((t) => expect(t).toHaveAttribute('tabindex', '-1'));
    });

    it('moves and activates with ArrowDown and ArrowUp, wrapping around', async () => {
      const { user } = await renderApp();
      const tabs = screen.getAllByRole('tab');
      tabs[0].focus();
      await user.keyboard('{ArrowDown}');
      expect(tabs[1]).toHaveFocus();
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('tabindex', '0');
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(tabs[tabs.length - 1]).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(tabs[0]).toHaveFocus();
      expect(selectedName()).toMatch(/^Sandbox/);
    });

    it('jumps to the first and last tab with Home and End', async () => {
      const { user } = await renderApp();
      const tabs = screen.getAllByRole('tab');
      tabs[0].focus();
      await user.keyboard('{End}');
      expect(tabs[tabs.length - 1]).toHaveFocus();
      expect(selectedName()).toMatch(/^Audit log/);
      await user.keyboard('{Home}');
      expect(tabs[0]).toHaveFocus();
      expect(selectedName()).toMatch(/^Sandbox/);
    });
  });

  describe('dialog focus management', () => {
    async function openInvite() {
      const ctx = await renderApp();
      await ctx.user.click(screen.getByRole('tab', { name: /^Members/ }));
      const opener = screen.getByRole('button', { name: /Invite/i });
      await ctx.user.click(opener);
      const dialog = await screen.findByRole('dialog', { name: /Invite member/i });
      return { ...ctx, opener, dialog };
    }

    it('keeps Tab and Shift+Tab inside the dialog', async () => {
      const { user, dialog } = await openInvite();
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, a[href]')
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      last.focus();
      await user.tab();
      expect(first).toHaveFocus();
      await user.tab({ shift: true });
      expect(last).toHaveFocus();
      for (let i = 0; i < focusable.length * 2 + 1; i++) {
        await user.tab();
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      }
    });

    it('closes on Escape and returns focus to the opening control', async () => {
      const { user, opener } = await openInvite();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });
  });
});
