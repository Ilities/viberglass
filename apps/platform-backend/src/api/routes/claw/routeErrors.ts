import {
  isClawServiceError,
  type ClawServiceError,
} from "../../../services/errors/ClawServiceError";

interface ClawRouteErrorBody {
  error: string;
  message: string;
}

export interface ClawRouteServiceErrorResponse {
  statusCode: number;
  body: ClawRouteErrorBody;
  serviceError: ClawServiceError;
}

function getErrorLabel(statusCode: number): string {
  if (statusCode >= 500) {
    return "Internal server error";
  }
  if (statusCode === 404) {
    return "Not found";
  }
  if (statusCode === 409) {
    return "Conflict";
  }
  return "Bad request";
}

export function resolveClawServiceError(
  error: unknown,
): ClawRouteServiceErrorResponse | null {
  if (!isClawServiceError(error)) {
    return null;
  }

  return {
    statusCode: error.statusCode,
    body: {
      error: getErrorLabel(error.statusCode),
      message: error.message,
    },
    serviceError: error,
  };
}
