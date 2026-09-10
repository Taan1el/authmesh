import { Router } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { UserRepository } from '../repositories/user.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { ApiKeyRepository } from '../repositories/api-key.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { PolicyService } from '../services/policy.service.js';
import { RateLimiterService } from '../services/rate-limiter.service.js';
import { AuthService } from '../services/auth.service.js';
import { TenantService } from '../services/tenant.service.js';
import { AuthController } from '../controllers/auth.controller.js';
import { TenantController } from '../controllers/tenant.controller.js';
import { createRbacMiddleware } from '../middleware/rbac.middleware.js';

export function createApiRouter(db: DatabaseSync): Router {
  const router = Router();

  // Repositories
  const userRepo = new UserRepository(db);
  const roleRepo = new RoleRepository(db);
  const apiKeyRepo = new ApiKeyRepository(db);
  const auditRepo = new AuditRepository(db);

  // Services
  const policyService = new PolicyService();
  const rateLimiter = new RateLimiterService();
  const authService = new AuthService(apiKeyRepo, userRepo, roleRepo, auditRepo, policyService, rateLimiter);
  const tenantService = new TenantService(userRepo, roleRepo, apiKeyRepo, auditRepo);

  // Middleware & Controllers
  const requirePermission = createRbacMiddleware(authService);
  const authController = new AuthController(authService, tenantService);
  const tenantController = new TenantController(tenantService);

  // Healthcheck
  router.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Access Evaluation & Chain Verification
  router.post('/auth/evaluate', authController.evaluate);
  router.get('/auth/verify-chain', authController.verifyChain);

  // Tenant Administration
  router.get('/users', tenantController.listUsers);
  router.post('/users', tenantController.createUser);
  router.patch('/users/:id/role', tenantController.updateUserRole);
  router.patch('/users/:id/status', tenantController.updateUserStatus);

  router.get('/roles', tenantController.listRoles);
  router.put('/roles/:name/permissions', tenantController.updateRolePermissions);

  router.get('/keys', tenantController.listKeys);
  router.post('/keys', tenantController.createKey);
  router.delete('/keys/:id', tenantController.revokeKey);

  router.get('/audit', tenantController.listAudit);
  router.get('/metrics', tenantController.getMetrics);

  // Guarded Sandbox Simulation Endpoints
  router.get('/protected/billing', requirePermission('billing:read', 'billing'), (req, res) => {
    res.json({
      success: true,
      message: 'Access granted to confidential FinTech billing records',
      actor: (req as any).authActor,
      data: {
        current_plan: 'Enterprise Tier',
        monthly_mrr_eur: 14500,
        next_billing_date: '2026-10-01',
      },
    });
  });

  router.post('/protected/billing/invoice', requirePermission('billing:write', 'billing'), (req, res) => {
    res.json({
      success: true,
      message: 'Invoice successfully generated and sent to SEPA billing gateway',
      actor: (req as any).authActor,
    });
  });

  router.get('/protected/users', requirePermission('users:read', 'users'), (req, res) => {
    res.json({
      success: true,
      message: 'Access granted to internal user roster',
      actor: (req as any).authActor,
    });
  });

  router.post('/protected/deploy', requirePermission('deploy:execute', 'deploy'), (req, res) => {
    res.json({
      success: true,
      message: 'Production Kubernetes deployment triggered successfully',
      actor: (req as any).authActor,
      deployment_id: `dep-${Date.now()}`,
    });
  });

  return router;
}
