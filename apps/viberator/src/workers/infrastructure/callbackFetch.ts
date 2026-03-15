import { Logger } from "winston";

export const INTERNAL_LOG_TAG = "[internal]";

export interface FetchRetryConfig {
  timeoutMs: number;
  label: string;
}

export interface FetchRetryOpts {
  logger: Logger;
  maxRetries: number;
  retryDelay: number;
  callbackToken?: string;
}

export function buildCallbackHeaders(
  tenantId: string,
  callbackToken?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Id": tenantId,
  };
  if (callbackToken) {
    headers["X-Callback-Token"] = callbackToken;
  }
  return headers;
}

export function redactSensitiveInfo(log: string): string {
  const sensitivePatterns = [
    /token[a-z]*["\s:=]+[a-zA-Z0-9_\-]{20,}/gi,
    /password["\s:=]+[^\s]+/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
    /gho_[a-zA-Z0-9]{36}/g,
    /ghu_[a-zA-Z0-9]{36}/g,
    /ghs_[a-zA-Z0-9]{36}/g,
    /ghr_[a-zA-Z0-9]{36}/g,
    /Bearer\s+[a-zA-Z0-9_\-]{20,}/gi,
  ];

  let redacted = log;
  for (const pattern of sensitivePatterns) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function tagInternalLog(message: string): string {
  return `${INTERNAL_LOG_TAG} ${message}`;
}

export function isInternalLogMessage(message: string): boolean {
  return message.includes(INTERNAL_LOG_TAG);
}

export async function fetchWithRetry(
  url: string,
  tenantId: string,
  body: unknown,
  config: FetchRetryConfig,
  context: Record<string, unknown>,
  opts: FetchRetryOpts,
): Promise<void> {
  const { logger, maxRetries, retryDelay, callbackToken } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        tagInternalLog(`Sending ${config.label} to platform`),
        { ...context, attempt: attempt + 1 },
      );

      const response = await fetch(url, {
        method: "POST",
        headers: buildCallbackHeaders(tenantId, callbackToken),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        const statusCode = response.status;
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        const errorMessage =
          typeof errorData?.error === "string"
            ? errorData.error
            : response.statusText;

        // Idempotency: another worker retry may have already finalized this job.
        if (
          statusCode === 409 &&
          errorMessage === "Job already in terminal state"
        ) {
          logger.warn(
            tagInternalLog(
              `${config.label} callback skipped because job is already terminal`,
            ),
            { ...context, statusCode, message: errorMessage },
          );
          return;
        }

        const isRetryable = statusCode >= 500 || statusCode === 429;

        if (!isRetryable) {
          logger.error(
            tagInternalLog(`Non-retryable error sending ${config.label}`),
            { ...context, statusCode, message: errorMessage },
          );
          throw new Error(`${config.label} callback failed: ${errorMessage}`);
        }

        if (attempt === maxRetries) {
          logger.error(
            tagInternalLog(`Max retries exceeded sending ${config.label}`),
            { ...context, lastStatus: statusCode },
          );
          throw new Error(
            `${config.label} callback failed after ${maxRetries + 1} attempts`,
          );
        }

        const delay = retryDelay * Math.pow(2, attempt);
        logger.warn(
          tagInternalLog(
            `Retryable error sending ${config.label}, will retry`,
          ),
          { ...context, attempt: attempt + 1, statusCode, delay },
        );
        await sleep(delay);
        continue;
      }

      logger.info(
        tagInternalLog(`${config.label} sent successfully`),
        { ...context, status: response.status },
      );
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      if (error instanceof Error && error.name === "AbortError") {
        logger.error(
          tagInternalLog(`${config.label} request timeout`),
          { ...context, attempt: attempt + 1 },
        );
        if (isLastAttempt) {
          throw new Error(
            `${config.label} callback timeout after ${maxRetries + 1} attempts`,
          );
        }
      } else if (
        error instanceof Error &&
        error.message.includes("callback failed")
      ) {
        throw error;
      } else {
        logger.error(
          tagInternalLog(`Unexpected error sending ${config.label}`),
          {
            ...context,
            attempt: attempt + 1,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        if (isLastAttempt) {
          throw error;
        }
      }

      const delay = retryDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
}
