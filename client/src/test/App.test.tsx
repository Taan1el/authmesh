import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../App';
import { User, Role, ApiKey, AuditEvent, TenantSecurityMetrics } from '../../../shared/types';

const mockUsers: User[] = [
  {
    id: 'u-1',
    email: 'laura.tamm@nordicfintech.ee',
    name: 'Laura Tamm',
    role: 'owner',
    status: 'active',
    mfa_enabled: true,
    last_login_at: '2026-09-10T12:00:00Z',
    created_at: '2026-09-10T10:00:00Z',
  },
  {
    id: 'u-2',
    email: 'sander.sepp@nordicfintech.ee',
    name: 'Sander Sepp',
    role: 'developer',
    status: 'active',
    mfa_enabled: true,
    last_login_at: '2026-09-10T12:00:00Z',
    created_at: '2026-09-10T10:00:00Z',
  },
];

const mockRoles: Role[] = [
  {
    name: 'owner',
    display_name: 'Organization Owner',
    description: 'Full root authority',
    permissions: ['*'],
    is_system: true,
  },
  {
    name: 'developer',
    display_name: 'Software Engineer',
    description: 'Developer services',
    permissions: ['users:read', 'keys:read', 'deploy:execute'],
    is_system: true,
  },
];

const mockKeys: ApiKey[] = [
  {
    id: 'key-1',
    name: 'CI/CD Deployment Token',
    key_prefix: 'am_live_ci_c...mock',
    scopes: ['deploy:read', 'deploy:execute'],
    created_by: 'u-2',
    rate_limit_rpm: 120,
    created_at: '2026-09-10T10:00:00Z',
  },
];

const mockAudit: AuditEvent[] = [
  {
    id: 'aud-1',
    actor_type: 'user',
    actor_id: 'u-1',
    actor_name: 'Laura Tamm',
    action: 'tenant.initialized',
    resource: 'system',
    status: 'granted',
    ip_address: '82.131.44.12',
    user_agent: 'Mozilla/5.0',
    details: JSON.stringify({ note: 'genesis' }),
    prev_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    created_at: '2026-09-10T10:00:00Z',
  },
];

const mockMetrics: TenantSecurityMetrics = {
  total_users: 2,
  active_api_keys: 1,
  security_score: 95,
  denied_events_24h: 0,
  audit_chain_valid: true,
  mfa_adoption_pct: 100,
};

describe('AuthMesh Security Gateway Client Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/users')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockUsers }) });
        }
        if (url.includes('/api/roles')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockRoles }) });
        }
        if (url.includes('/api/keys')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockKeys }) });
        }
        if (url.includes('/api/audit')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockAudit }) });
        }
        if (url.includes('/api/metrics')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: mockMetrics }) });
        }
        if (url.includes('/api/auth/verify-chain')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { valid: true, totalBlocks: 1 } }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      })
    );
  });

  it('renders application header branding and organization tenant name', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /AuthMesh/i })).toBeInTheDocument();
    expect(screen.getByText(/Nordic FinTech Labs/i)).toBeInTheDocument();
  });

  it('renders security posture score and audit chain status KPI cards', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Security Posture Score')).toBeInTheDocument();
      expect(screen.getByText('95')).toBeInTheDocument();
      expect(screen.getByText(/Grade A\+/i)).toBeInTheDocument();
      expect(screen.getByText('✓ Verified Hash Chain')).toBeInTheDocument();
    });
  });

  it('renders interactive security sandbox tab by default', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Interactive RBAC Security Sandbox/i)).toBeInTheDocument();
      expect(screen.getByText('🚀 Dispatch Request')).toBeInTheDocument();
      expect(screen.getByText('⚡ Test Rate Limiting (Burst 4x)')).toBeInTheDocument();
    });
  });

  it('switches to RBAC Policy Matrix tab and renders permissions', async () => {
    render(<App />);

    const matrixTab = await screen.findByText(/🛡️ RBAC Policy Matrix/i);
    fireEvent.click(matrixTab);

    await waitFor(() => {
      expect(screen.getByText('Enterprise Role & Scope Access Matrix')).toBeInTheDocument();
      expect(screen.getByText('Organization Owner')).toBeInTheDocument();
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });
  });

  it('switches to API Key Vault tab and displays tokens', async () => {
    render(<App />);

    const keysTab = await screen.findByText(/🔑 API Key Vault/i);
    fireEvent.click(keysTab);

    await waitFor(() => {
      expect(screen.getByText('CI/CD Deployment Token')).toBeInTheDocument();
      expect(screen.getByText('am_live_ci_c...mock')).toBeInTheDocument();
      expect(screen.getByText('+ Generate New API Key')).toBeInTheDocument();
    });
  });

  it('switches to Tenant Identities tab and displays member credentials', async () => {
    render(<App />);

    const usersTab = await screen.findByText(/👥 Tenant Identities/i);
    fireEvent.click(usersTab);

    await waitFor(() => {
      expect(screen.getByText('Laura Tamm')).toBeInTheDocument();
      expect(screen.getByText('laura.tamm@nordicfintech.ee')).toBeInTheDocument();
      expect(screen.getByText('Sander Sepp')).toBeInTheDocument();
      expect(screen.getAllByText('🔒 Enforced').length).toBeGreaterThan(0);
    });
  });

  it('switches to Immutable Audit Trail tab and displays block hash', async () => {
    render(<App />);

    const auditTab = await screen.findByText(/⛓️ Immutable Audit Trail/i);
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(screen.getAllByText('Cryptographically Chained Audit Ledger').length).toBeGreaterThan(0);
      expect(screen.getByText('tenant.initialized')).toBeInTheDocument();
      expect(screen.getByText('a1b2c3d4e5f678...')).toBeInTheDocument();
    });
  });
});
