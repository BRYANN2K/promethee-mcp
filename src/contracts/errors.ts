export type ApplicationErrorCode =
  | "access_denied"
  | "authentication_required"
  | "dependency_unavailable"
  | "incompatible_source"
  | "idempotency_conflict"
  | "insufficient_scope"
  | "internal_error"
  | "invalid_cursor"
  | "invalid_input"
  | "not_found"
  | "request_cancelled"
  | "rate_limited"
  | "response_too_large";

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly retryable: boolean;

  constructor(code: ApplicationErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function invalidInput(message = "The request is invalid."): ApplicationError {
  return new ApplicationError("invalid_input", message);
}

export function invalidCursor(): ApplicationError {
  return new ApplicationError("invalid_cursor", "The cursor is invalid or expired.");
}

export function incompatibleSource(): ApplicationError {
  return new ApplicationError(
    "incompatible_source",
    "The data source returned an unsupported response.",
  );
}
