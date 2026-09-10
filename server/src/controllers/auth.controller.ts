import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { TenantService } from '../services/tenant.service.js';

export class AuthController {
  constructor(
    private authService: AuthService,
    private tenantService: TenantService
  ) {}

  evaluate = (req: Request, res: Response): void => {
    try {
      const { token, user_id, permission, resource } = req.body;
      if (!permission || !resource) {
        res.status(400).json({ success: false, error: 'permission and resource are required' });
        return;
      }

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'AuthMesh WebUI';

      const result = this.authService.evaluateAccess(
        { token, user_id, permission, resource },
        clientIp,
        userAgent
      );

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  verifyChain = (_req: Request, res: Response): void => {
    try {
      const verification = this.tenantService.verifyAuditChain();
      res.json({ success: true, data: verification });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
