export type CommerceErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'INBOUND_PAUSED'
  | 'OUTBOUND_PAUSED'
  | 'RESERVATION_DISABLED'
  | 'CURSOR_EXPIRED'
  | 'UNSUPPORTED'
  | 'INSUFFICIENT_STOCK';

export class CommerceError extends Error {
  readonly code: CommerceErrorCode;
  readonly httpStatus: number;
  readonly retryAfter?: number;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: CommerceErrorCode;
    message: string;
    httpStatus: number;
    retryAfter?: number;
    requestId?: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'CommerceError';
    this.code = input.code;
    this.httpStatus = input.httpStatus;
    this.retryAfter = input.retryAfter;
    this.requestId = input.requestId ?? crypto.randomUUID();
    this.details = input.details;
  }
}

export function commerceErrorBody(err: CommerceError) {
  return {
    ok: false as const,
    code: err.code,
    error: err.message,
    requestId: err.requestId,
    details: err.details,
  };
}

export function httpStatusFor(code: CommerceErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'VALIDATION':
    case 'UNSUPPORTED':
    case 'RESERVATION_DISABLED':
    case 'CURSOR_EXPIRED':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    case 'INBOUND_PAUSED':
    case 'OUTBOUND_PAUSED':
    case 'INSUFFICIENT_STOCK':
      return 409;
    default:
      return 400;
  }
}
