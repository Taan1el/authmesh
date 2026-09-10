import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';

export function createRbacMiddleware(authService: AuthService) {
  return function requirePermission(permission: string, resource: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authHeader = req.headers.authorization;
      const userIdHeader = req.headers['x-user-id'] as string | undefined;

      let token: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }

      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Express Client';

      const result = authService.evaluateAccess(
        {
          token,
          user_id: userIdHeader,
          permission,
          resource,
        },
        clientIp,
        userAgent
      );

      if (result.rate_limit) {
        res.setHeader('X-RateLimit-Limit', String(result.rate_limit.limit));
        res.setHeader('X-RateLimit-Remaining', String(result.rate_limit.remaining));
        res.setHeader('X-RateLimit-Reset', String(result.rate_limit.reset_seconds));
      }

      if (!result.allowed) {
        if (result.reason.includes('Rate limit quota exceeded')) {
          res.status(429).json({
            success: false,
            error: result.reason,
            evaluation: result,
          });
          return;
        }

        if (result.reason.includes('Invalid or unrecognized API key token')) {
          res.status(401).json({
            success: false,
            error: result.reason,
            evaluation: result,
          });
          return;
        }

        res.status(403).json({
          success: false,
          error: result.reason,
          evaluation: result,
        });
        return;
      }

      (req as any).authActor = result.actor;
      next();
    };
  };
}
