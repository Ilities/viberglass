/**
 * Base class for all domain errors.
 * Carries a stable error code and HTTP status code so that route-level
 * catch blocks can be replaced by a single error-mapping middleware.
 */
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Type guard to check if an error is a DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
