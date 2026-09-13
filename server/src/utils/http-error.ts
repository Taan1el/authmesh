import { Response } from 'express';

/**
 * An error safe to show to API clients. Anything thrown that is not an
 * HttpError is treated as unexpected: it gets logged on the server and the
 * client only ever sees a generic message, never the raw error text or a
 * stack trace.
 */
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

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
