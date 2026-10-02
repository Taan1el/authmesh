import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeyVault } from '../components/ApiKeyVault';
import { ApiKey } from '../../../shared/types';

describe('ApiKeyVault', () => {
  it('opens the create-key modal as an accessible, labelled dialog, focuses the name field, and closes on Escape', async () => {
    const onCreateKey = vi.fn();
    const onRevokeKey = vi.fn();
    render(<ApiKeyVault apiKeys={[]} onCreateKey={onCreateKey} onRevokeKey={onRevokeKey} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Generate key/i }));

    const dialog = await screen.findByRole('dialog', { name: /Generate scoped API key/i });
    expect(dialog).toBeInTheDocument();

    const nameInput = screen.getByLabelText('Key name');
    await waitFor(() => expect(nameInput).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('submits the form with the name and default scope, and shows the revealed token once', async () => {
    const onCreateKey = vi.fn().mockResolvedValue({
      id: 'key-new',
      name: 'Reporting Service',
      key_prefix: 'am_live_ab12...cd34',
      scopes: ['users:read'],
      created_by: 'user-1',
      rate_limit_rpm: 60,
      last_used_at: null,
      expires_at: null,
      revoked_at: null,
      created_at: '2026-01-01T00:00:00Z',
      plaintext_token: 'am_live_abcd1234',
    } as ApiKey & { plaintext_token: string });

    render(<ApiKeyVault apiKeys={[]} onCreateKey={onCreateKey} onRevokeKey={vi.fn()} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Generate key/i }));
    await user.type(screen.getByLabelText('Key name'), 'Reporting Service');
    await user.click(screen.getByRole('button', { name: /Create key/i }));

    await waitFor(() => {
      expect(onCreateKey).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Reporting Service', scopes: ['users:read'] })
      );
    });
    expect(await screen.findByText('am_live_abcd1234')).toBeInTheDocument();
  });

  it('lists existing keys without ever rendering a plaintext token', () => {
    const keys: ApiKey[] = [
      {
        id: 'key-1',
        name: 'CI/CD Token',
        key_prefix: 'am_live_ci_c...mock',
        scopes: ['deploy:execute'],
        created_by: 'user-1',
        rate_limit_rpm: 120,
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    render(<ApiKeyVault apiKeys={keys} onCreateKey={vi.fn()} onRevokeKey={vi.fn()} />);

    expect(screen.getByText('CI/CD Token')).toBeInTheDocument();
    expect(screen.getByText('am_live_ci_c...mock')).toBeInTheDocument();
    expect(screen.queryByText(/^am_live_[a-f0-9]{48}$/)).not.toBeInTheDocument();
  });
});
