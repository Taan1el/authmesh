import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { TenantService } from '../services/tenant.service.js';
import { badRequest, sendError } from '../utils/http-error.js';
import { isNonEmptyString } from '../utils/validation.js';

export class AuthController {
  constructor(
    private authService: AuthService,
    private tenantService: TenantService
  ) {}

  evaluate = (req: Request, res: Response): void => {
    try {
      const { token, user_id, permission, resource } = req.body ?? {};
      if (!isNonEmptyString(permission) || !isNonEmptyString(resource)) {
        throw badRequest('permission and resource are required');
      }
      if (!isNonEmptyString(token) && !isNonEmptyString(user_id)) {
        throw badRequest('either token or user_id is required');
      }

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'AuthMesh WebUI';

      const result = this.authService.evaluateAccess(
        { token, user_id, permission, resource },
        clientIp,
        userAgent
      );

      res.json({ success: true, data: result });
    } catch (err) {
      sendError(res, err);
    }
  };

  verifyChain = (_req: Request, res: Response): void => {
    try {
      const verification = this.tenantService.verifyAuditChain();
      res.json({ success: true, data: verification });
    } catch (err) {
      sendError(res, err);
    }
  };
}
