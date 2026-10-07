import type { components } from './openapi.js';

type DeliveryError = components['schemas']['DeliveryErrorResponse']['error'];

export type ErrorCode = DeliveryError['code'];

/** Why a request was refused, when the code alone doesn't say. */
export type ErrorReason = NonNullable<DeliveryError['reason']>;

export type FieldErrorCode = DeliveryError['fieldErrors'][number]['code'];

export interface FieldError {
  /** The parameter it is about: `filter.tags`, `sort`, `limit`. */
  field: string;
  // A newer API may name a code this version doesn't know yet.
  code: FieldErrorCode | (string & {});
  message: string;
  params?: Record<string, number | string | boolean | readonly string[]>;
}

interface ErrorEnvelope {
  error: {
    code: string;
    reason: string | null;
    message: string;
    fieldErrors?: FieldError[];
    reasonData?: unknown;
  };
}

const isEnvelope = (body: unknown): body is ErrorEnvelope => {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return false;
  }
  const { error } = body;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
};

export class ElgavioError extends Error {
  override readonly name = 'ElgavioError';
  readonly status: number;
  readonly code: ErrorCode | (string & {});
  readonly reason: ErrorReason | (string & {}) | null;
  readonly fieldErrors: FieldError[];
  readonly reasonData: unknown;

  constructor(
    status: number,
    error: {
      code: string;
      reason: string | null;
      message: string;
      fieldErrors?: FieldError[];
      reasonData?: unknown;
    },
  ) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.reason = error.reason;
    this.fieldErrors = error.fieldErrors ?? [];
    this.reasonData = error.reasonData ?? null;
  }
}

/** A refused request's error, from the API's envelope or, without one, from the status alone. */
export const errorFromResponse = (status: number, body: unknown): ElgavioError =>
  isEnvelope(body)
    ? new ElgavioError(status, body.error)
    : new ElgavioError(status, {
        code: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
        reason: null,
        message: `The Elgavio API answered ${String(status)}.`,
      });

/** Narrows to an `ElgavioError`, with that reason when one is given. */
export const isElgavioError = (error: unknown, reason?: ErrorReason): error is ElgavioError =>
  error instanceof ElgavioError && (reason === undefined || error.reason === reason);
