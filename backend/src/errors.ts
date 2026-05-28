/**
 * Custom error hierarchy used throughout the backend.
 *
 * All application errors extend `AppError` so the global `errorHandler`
 * middleware can distinguish them from unexpected errors and return the
 * correct HTTP status code and `code` string to the client.
 *
 * Usage pattern in services / controllers:
 *   throw new NotFoundError("User not found");
 *
 * Imported by: all service files, middleware/errorHandler.ts.
 */

/**
 * Base class for all intentional application errors.
 * Extends the native Error so it can be caught by standard try/catch.
 *
 * @param statusCode - HTTP status code to send to the client.
 * @param message    - Human-readable error description (sent as `error` in JSON).
 * @param code       - Machine-readable error identifier (sent as `code` in JSON).
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * 400 Bad Request — request body failed schema / business-logic validation.
 * Used when: invalid field values, missing required fields, weak passwords.
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

/**
 * 401 Unauthorized — the request lacks valid authentication credentials.
 * Used when: no token, expired token, invalid token, wrong password.
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message, "UNAUTHORIZED");
  }
}

/**
 * 403 Forbidden — the authenticated user lacks permission for this action.
 * Used when: non-admin tries an admin action, member tries to delete owner, etc.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, message, "FORBIDDEN");
  }
}

/**
 * 404 Not Found — the requested resource does not exist.
 * Used when: channel/user/message ID not found in the database.
 */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, "NOT_FOUND");
  }
}

/**
 * 409 Conflict — the request would violate a uniqueness constraint.
 * Used when: email or username already registered, duplicate channel name.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

/**
 * 410 Gone — the resource existed but is no longer valid.
 * Used when: invite link has expired or reached its maximum use count.
 */
export class GoneError extends AppError {
  constructor(message: string) {
    super(410, message, "GONE");
  }
}
