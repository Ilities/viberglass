export class IntegrationRouteServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body: Record<string, unknown> = { error: message },
  ) {
    super(message)
    this.name = 'IntegrationRouteServiceError'
  }
}

export function isIntegrationRouteServiceError(
  error: unknown,
): error is IntegrationRouteServiceError {
  return error instanceof IntegrationRouteServiceError
}
