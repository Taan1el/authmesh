import { Request, Response } from 'express';
import { TenantService } from '../services/tenant.service.js';
import { RoleName } from '../../../shared/types.js';

export class TenantController {
  constructor(private tenantService: TenantService) {}

  listUsers = (_req: Request, res: Response): void => {
    try {
      const users = this.tenantService.listUsers();
      res.json({ success: true, data: users });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  createUser = (req: Request, res: Response): void => {
    try {
      const { email, name, role, mfa_enabled } = req.body;
      if (!email || !name || !role) {
        res.status(400).json({ success: false, error: 'email, name, and role are required' });
        return;
      }
      const user = this.tenantService.createUser({ email, name, role, mfa_enabled });
      res.status(201).json({ success: true, data: user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  updateUserRole = (req: Request, res: Response): void => {
    try {
      const { role } = req.body;
      if (!role) {
        res.status(400).json({ success: false, error: 'role is required' });
        return;
      }
      const updated = this.tenantService.updateUserRole(req.params.id, role as RoleName);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  updateUserStatus = (req: Request, res: Response): void => {
    try {
      const { status } = req.body;
      if (!status || !['active', 'suspended'].includes(status)) {
        res.status(400).json({ success: false, error: 'status must be active or suspended' });
        return;
      }
      const updated = this.tenantService.updateUserStatus(req.params.id, status);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  listRoles = (_req: Request, res: Response): void => {
    try {
      const roles = this.tenantService.listRoles();
      res.json({ success: true, data: roles });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  updateRolePermissions = (req: Request, res: Response): void => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        res.status(400).json({ success: false, error: 'permissions must be an array of strings' });
        return;
      }
      const updated = this.tenantService.updateRolePermissions(req.params.name as RoleName, permissions);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  listKeys = (_req: Request, res: Response): void => {
    try {
      const keys = this.tenantService.listApiKeys();
      res.json({ success: true, data: keys });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  createKey = (req: Request, res: Response): void => {
    try {
      const { name, scopes, rate_limit_rpm, expires_in_days } = req.body;
      if (!name || !Array.isArray(scopes) || scopes.length === 0) {
        res.status(400).json({ success: false, error: 'name and at least one scope are required' });
        return;
      }

      // Default to first user or system admin
      const users = this.tenantService.listUsers();
      const creatorId = users[0]?.id || 'system';

      const key = this.tenantService.createApiKey(creatorId, {
        name,
        scopes,
        rate_limit_rpm: rate_limit_rpm ? Number(rate_limit_rpm) : 60,
        expires_in_days: expires_in_days ? Number(expires_in_days) : undefined,
      });

      res.status(201).json({ success: true, data: key });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  revokeKey = (req: Request, res: Response): void => {
    try {
      const revoked = this.tenantService.revokeApiKey(req.params.id);
      res.json({ success: true, data: revoked });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  listAudit = (req: Request, res: Response): void => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const events = this.tenantService.listAuditEvents(limit);
      res.json({ success: true, data: events });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  getMetrics = (_req: Request, res: Response): void => {
    try {
      const metrics = this.tenantService.getTenantMetrics();
      res.json({ success: true, data: metrics });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
