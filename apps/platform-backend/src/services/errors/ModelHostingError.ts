import { DomainError } from "./DomainError";

export class ModelHostingError extends DomainError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}
