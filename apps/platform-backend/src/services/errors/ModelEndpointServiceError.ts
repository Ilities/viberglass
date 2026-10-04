import { DomainError } from "./DomainError";

export class ModelEndpointServiceError extends DomainError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}
