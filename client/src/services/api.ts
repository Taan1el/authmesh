import {
  User,
  Role,
  ApiKey,
  AuditEvent,
  TenantSecurityMetrics,
  RoleName,
  CreateUserDto,
  CreateApiKeyDto,
  EvaluateAccessDto,
  AccessEvaluationResult,
} from '../../../shared/types';

const API_BASE = '/api';

export const api = {
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getUsers(): Promise<User[]> {
    const res = await fetch(`${API_BASE}/users`);
    const json = await res.json();
    return json.data || [];
  },

  async createUser(dto: CreateUserDto): Promise<User> {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create user');
    return json.data;
  },

  async updateUserRole(id: string, role: RoleName): Promise<User> {
    const res = await fetch(`${API_BASE}/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update role');
    return json.data;
  },

  async updateUserStatus(id: string, status: 'active' | 'suspended'): Promise<User> {
    const res = await fetch(`${API_BASE}/users/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update status');
    return json.data;
  },

  async getRoles(): Promise<Role[]> {
    const res = await fetch(`${API_BASE}/roles`);
    const json = await res.json();
    return json.data || [];
  },

  async updateRolePermissions(name: RoleName, permissions: string[]): Promise<Role> {
    const res = await fetch(`${API_BASE}/roles/${name}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update permissions');
    return json.data;
  },

  async getKeys(): Promise<ApiKey[]> {
    const res = await fetch(`${API_BASE}/keys`);
    const json = await res.json();
    return json.data || [];
  },

  async createKey(dto: CreateApiKeyDto): Promise<ApiKey & { plaintext_token: string }> {
    const res = await fetch(`${API_BASE}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create API key');
    return json.data;
  },

  async revokeKey(id: string): Promise<ApiKey> {
    const res = await fetch(`${API_BASE}/keys/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to revoke key');
    return json.data;
  },

  async getAudit(limit = 100): Promise<AuditEvent[]> {
    const res = await fetch(`${API_BASE}/audit?limit=${limit}`);
    const json = await res.json();
    return json.data || [];
  },

  async verifyAuditChain(): Promise<{ valid: boolean; totalBlocks: number; brokenBlockId?: string }> {
    const res = await fetch(`${API_BASE}/auth/verify-chain`);
    const json = await res.json();
    return json.data || { valid: false, totalBlocks: 0 };
  },

  async getMetrics(): Promise<TenantSecurityMetrics> {
    const res = await fetch(`${API_BASE}/metrics`);
    const json = await res.json();
    return (
      json.data || {
        total_users: 0,
        active_api_keys: 0,
        security_score: 0,
        denied_events_24h: 0,
        audit_chain_valid: false,
        mfa_adoption_pct: 0,
      }
    );
  },

  async evaluateAccess(dto: EvaluateAccessDto): Promise<AccessEvaluationResult> {
    const res = await fetch(`${API_BASE}/auth/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const json = await res.json();
    return json.data;
  },

  // Direct sandbox simulation requests through protected endpoints
  async simulateProtectedRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    authType: 'token' | 'user',
    authValue: string
  ): Promise<{ status: number; headers: Record<string, string>; data: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authType === 'token') {
      headers['Authorization'] = `Bearer ${authValue}`;
    } else {
      headers['x-user-id'] = authValue;
    }

    const res = await fetch(`/api/protected/${endpoint}`, {
      method,
      headers,
    });

    const headerObj: Record<string, string> = {
      'x-ratelimit-limit': res.headers.get('x-ratelimit-limit') || '-',
      'x-ratelimit-remaining': res.headers.get('x-ratelimit-remaining') || '-',
      'x-ratelimit-reset': res.headers.get('x-ratelimit-reset') || '-',
    };

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = { message: res.statusText };
    }

    return {
      status: res.status,
      headers: headerObj,
      data,
    };
  },
};
