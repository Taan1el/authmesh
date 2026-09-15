/**
 * An error safe to show to API clients (and to the in-browser demo, which
 * throws these from the same shared service classes the server uses).
 * Anything else thrown from those services is treated as unexpected: the
 * server logs it and returns a generic message, and the demo adapter should
 * do the same, so internal error text and stack traces never reach the UI
 * as if they were a normal validation message.
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
