export type RoleName =
  | 'owner'
  | 'admin'
  | 'developer'
  | 'security_auditor'
  | 'billing_manager'
  | 'viewer';

export type StandardPermission =
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'roles:read'
  | 'roles:assign'
  | 'keys:read'
  | 'keys:create'
  | 'keys:revoke'
  | 'billing:read'
  | 'billing:write'
  | 'audit:read'
  | 'audit:export'
  | 'deploy:read'
  | 'deploy:execute';

export interface User {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  status: 'active' | 'suspended';
  mfa_enabled: boolean;
  last_login_at: string;
  created_at: string;
}

export interface Role {
  name: RoleName;
  display_name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by: string;
  rate_limit_rpm: number;
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  plaintext_token?: string; // Only returned once on initial generation
}

export interface AuditEvent {
  id: string;
  actor_type: 'user' | 'api_key' | 'system';
  actor_id: string;
  actor_name: string;
  action: string;
  resource: string;
  status: 'granted' | 'denied';
  ip_address: string;
  user_agent: string;
  details: string; // JSON serialized string
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface TenantSecurityMetrics {
  total_users: number;
  active_api_keys: number;
  security_score: number;
  denied_events_24h: number;
  audit_chain_valid: boolean;
  mfa_adoption_pct: number;
}

export interface CreateUserDto {
  name: string;
  email: string;
  role: RoleName;
  mfa_enabled?: boolean;
}

export interface UpdateUserRoleDto {
  role: RoleName;
}

export interface CreateApiKeyDto {
  name: string;
  scopes: string[];
  rate_limit_rpm?: number;
  expires_in_days?: number;
}

export interface EvaluateAccessDto {
  token?: string;
  user_id?: string;
  permission: string;
  resource: string;
}

export interface AccessEvaluationResult {
  allowed: boolean;
  reason: string;
  required_permission: string;
  matching_scope?: string | null;
  actor?: {
    type: 'user' | 'api_key';
    id: string;
    name: string;
    role?: string;
  };
  rate_limit?: {
    limit: number;
    remaining: number;
    reset_seconds: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
