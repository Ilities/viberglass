/** The HTTP status the Docker API answered a failed request with, if it got that far. */
export function dockerStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error;
    return typeof statusCode === "number" ? statusCode : undefined;
  }
  return undefined;
}
