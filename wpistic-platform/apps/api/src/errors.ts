/**
 * Structured error handling: every error path returns the same envelope
 * { error: { code, message, correlation_id, details? } }.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from './env';

type Status = 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

export class ApiError extends Error {
  constructor(
    public status: Status,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(resource = 'Resource') {
    return new ApiError(404, 'not_found', `${resource} not found`);
  }
  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
  static paymentRequired(code: string, message: string) {
    return new ApiError(402, code, message);
  }
  static unavailable(code: string, message: string) {
    return new ApiError(503, code, message);
  }
}

export function errorResponse(c: Context<AppContext>, err: unknown) {
  const correlationId = c.get('correlationId');

  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, correlation_id: correlationId, details: err.details } },
      err.status
    );
  }
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: 'http_error', message: err.message, correlation_id: correlationId } },
      err.status
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/too many clients|remaining connection slots|connection.*exhaust/i.test(message)) {
    c.header('Retry-After', '5');
    return c.json(
      { error: { code: 'database_unavailable', message: 'Database is temporarily busy; retry shortly', correlation_id: correlationId } },
      503
    );
  }
  console.error(
    JSON.stringify({
      level: 'error',
      correlation_id: correlationId,
      path: c.req.path,
      message,
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  return c.json(
    { error: { code: 'internal_error', message: 'Something went wrong', correlation_id: correlationId } },
    500
  );
}
