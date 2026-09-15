import { Response } from 'express';
import { HttpError } from '../../../shared/http-error.js';

// HttpError, badRequest and notFound live in shared/http-error.ts so
// TenantService and AuthService (also shared) can throw them without a
// dependency on Express. Re-exported here so existing server imports
// (controllers, repositories) do not need to change.
export { HttpError, badRequest, notFound } from '../../../shared/http-error.js';

/**
 * Sends a safe error response. Known, expected errors (HttpError) return
 * their own status and message. Anything else is logged server-side only
 * and reported to the client as a generic 500, so internal error text and
 * stack traces never leak over the API.
 */
export function sendError(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  console.error('Unhandled request error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}
