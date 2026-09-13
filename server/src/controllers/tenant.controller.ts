import { Request, Response } from 'express';
import { TenantService } from '../services/tenant.service.js';
import { RoleName } from '../../../shared/types.js';
import { badRequest, sendError } from '../utils/http-error.js';
import { clampPositiveInt, isNonEmptyString, isValidPermissionList } from '../utils/validation.js';

const MAX_AUDIT_LIMIT = 500;
const MAX_RATE_LIMIT_RPM = 10000;
const MAX_EXPIRES_IN_DAYS = 3650;

export class TenantController {
  constructor(private tenantService: TenantService) {}

  listUsers = (_req: Request, res: Response): void => {
    try {
      const users = this.tenantService.listUsers();
      res.json({ success: true, data: users });
    } catch (err) {
      sendError(res, err);
    }
  };

  createUser = (req: Request, res: Response): void => {
    try {
      const { email, name, role, mfa_enabled } = req.body ?? {};
      if (!isNonEmptyString(email) || !isNonEmptyString(name) || !isNonEmptyString(role)) {
        throw badRequest('email, name, and role are required');
      }
      const user = this.tenantService.createUser({
        email,
        name,
        role: role as RoleName,
        mfa_enabled: Boolean(mfa_enabled),
      });
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      sendError(res, err);
    }
  };

  updateUserRole = (req: Request, res: Response): void => {
    try {
      const { role } = req.body ?? {};
      if (!isNonEmptyString(role)) {
        throw badRequest('role is required');
      }
      const updated = this.tenantService.updateUserRole(req.params.id, role as RoleName);
      res.json({ success: true, data: updated });
    } catch (err) {
      sendError(res, err);
    }
  };

  updateUserStatus = (req: Request, res: Response): void => {
    try {
      const { status } = req.body ?? {};
      if (status !== 'active' && status !== 'suspended') {
        throw badRequest('status must be active or suspended');
      }
      const updated = this.tenantService.updateUserStatus(req.params.id, status);
      res.json({ success: true, data: updated });
    } catch (err) {
      sendError(res, err);
    }
  };

  listRoles = (_req: Request, res: Response): void => {
    try {
      const roles = this.tenantService.listRoles();
      res.json({ success: true, data: roles });
    } catch (err) {
      sendError(res, err);
    }
  };

  updateRolePermissions = (req: Request, res: Response): void => {
    try {
      const { permissions } = req.body ?? {};
      if (!isValidPermissionList(permissions)) {
        throw badRequest(
          'permissions must be a non-empty array of permission strings (for example "users:read" or "billing:*")'
        );
      }
      const updated = this.tenantService.updateRolePermissions(req.params.name as RoleName, permissions);
      res.json({ success: true, data: updated });
    } catch (err) {
      sendError(res, err);
    }
  };

  listKeys = (_req: Request, res: Response): void => {
    try {
      const keys = this.tenantService.listApiKeys();
      res.json({ success: true, data: keys });
    } catch (err) {
      sendError(res, err);
    }
  };

  createKey = (req: Request, res: Response): void => {
    try {
      const { name, scopes, rate_limit_rpm, expires_in_days } = req.body ?? {};
      if (!isNonEmptyString(name) || !isValidPermissionList(scopes)) {
        throw badRequest('name and at least one valid scope are required');
      }

      // Attribute the key to the identity making the request when the
      // sandbox provides one; otherwise fall back to the tenant's first
      // (oldest) member, since every key needs an owning user.
      const requestedActor = req.headers['x-user-id'] as string | undefined;
      const users = this.tenantService.listUsers();
      const creatorId =
        (requestedActor && users.find((u) => u.id === requestedActor)?.id) || users[0]?.id;

      if (!creatorId) {
        throw badRequest('cannot create an API key before any user exists');
      }

      const key = this.tenantService.createApiKey(creatorId, {
        name,
        scopes,
        rate_limit_rpm: clampPositiveInt(rate_limit_rpm, 60, MAX_RATE_LIMIT_RPM),
        expires_in_days: expires_in_days
          ? clampPositiveInt(expires_in_days, 90, MAX_EXPIRES_IN_DAYS)
          : undefined,
      });

      res.status(201).json({ success: true, data: key });
    } catch (err) {
      sendError(res, err);
    }
  };

  revokeKey = (req: Request, res: Response): void => {
    try {
      const revoked = this.tenantService.revokeApiKey(req.params.id);
      res.json({ success: true, data: revoked });
    } catch (err) {
      sendError(res, err);
    }
  };

  listAudit = (req: Request, res: Response): void => {
    try {
      const limit = clampPositiveInt(req.query.limit, 100, MAX_AUDIT_LIMIT);
      const events = this.tenantService.listAuditEvents(limit);
      res.json({ success: true, data: events });
    } catch (err) {
      sendError(res, err);
    }
  };

  getMetrics = (_req: Request, res: Response): void => {
    try {
      const metrics = this.tenantService.getTenantMetrics();
      res.json({ success: true, data: metrics });
    } catch (err) {
      sendError(res, err);
    }
  };
}
