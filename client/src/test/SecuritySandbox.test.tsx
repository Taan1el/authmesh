import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecuritySandbox } from '../components/SecuritySandbox';
import { api } from '../services/index';
import { User } from '../../../shared/types';

const users: User[] = [
  {
    id: 'u-1',
    email: 'laura.tamm@nordicfintech.ee',
    name: 'Laura Tamm',
    role: 'owner',
    status: 'active',
    mfa_enabled: true,
    last_login_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u-2',
    email: 'sander.sepp@nordicfintech.ee',
    name: 'Sander Sepp',
    role: 'developer',
    status: 'active',
    mfa_enabled: true,
    last_login_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
];

describe('SecuritySandbox', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Regression test for a real bug: the "Simulated user" dropdown showed
  // Laura Tamm selected from the first render, but the component's state
  // stayed empty (useState's default only evaluates once, and `users`
  // normally arrives after the initial render from App's data load), so
  // the very first "Send request" click sent an empty user_id.
  it('sends the first user id on the first Send request click with no dropdown interaction', async () => {
    const simulateSpy = vi.spyOn(api, 'simulateProtectedRequest').mockResolvedValue({
      status: 200,
      headers: { 'x-ratelimit-limit': '-', 'x-ratelimit-remaining': '-', 'x-ratelimit-reset': '-' },
      data: { success: true, message: 'Access granted' },
    });

    render(<SecuritySandbox users={users} apiKeys={[]} onAuditUpdated={() => {}} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() => {
      expect(simulateSpy).toHaveBeenCalledWith('billing', 'GET', 'user', 'u-1');
    });
    expect(await screen.findByText(/HTTP 200/)).toBeInTheDocument();
  });

  it('switches the selected user when a different option is chosen', async () => {
    const simulateSpy = vi.spyOn(api, 'simulateProtectedRequest').mockResolvedValue({
      status: 403,
      headers: { 'x-ratelimit-limit': '-', 'x-ratelimit-remaining': '-', 'x-ratelimit-reset': '-' },
      data: { success: false, error: "Role 'developer' lacks permission 'billing:read'" },
    });

    render(<SecuritySandbox users={users} apiKeys={[]} onAuditUpdated={() => {}} />);

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Simulated user'), 'u-2');
    await user.click(screen.getByRole('button', { name: /Send request/i }));

    await waitFor(() => {
      expect(simulateSpy).toHaveBeenCalledWith('billing', 'GET', 'user', 'u-2');
    });
  });

  it('lets keyboard users choose a protected endpoint (button, not a bare div)', async () => {
    vi.spyOn(api, 'simulateProtectedRequest').mockResolvedValue({
      status: 200,
      headers: { 'x-ratelimit-limit': '-', 'x-ratelimit-remaining': '-', 'x-ratelimit-reset': '-' },
      data: { success: true },
    });

    render(<SecuritySandbox users={users} apiKeys={[]} onAuditUpdated={() => {}} />);

    const deployOption = screen.getByRole('button', { name: /deploy:execute/i });
    expect(deployOption).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(deployOption);
    expect(deployOption).toHaveAttribute('aria-pressed', 'true');
  });
});
