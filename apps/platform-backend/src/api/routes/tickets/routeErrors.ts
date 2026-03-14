import {
  isTicketServiceError,
  type TicketServiceError,
} from "../../../services/errors/TicketServiceError";

interface TicketRouteErrorBody {
  error: string;
  message: string;
}

export interface TicketRouteServiceErrorResponse {
  statusCode: number;
  body: TicketRouteErrorBody;
  serviceError: TicketServiceError;
}

function getErrorLabel(statusCode: number): string {
  if (statusCode >= 500) {
    return "Internal server error";
  }
  if (statusCode === 404) {
    return "Not found";
  }
  return "Bad request";
}

export function resolveTicketRouteServiceError(
  error: unknown,
): TicketRouteServiceErrorResponse | null {
  if (!isTicketServiceError(error)) {
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

