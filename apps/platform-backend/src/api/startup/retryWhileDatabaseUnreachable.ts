const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED", // database not listening yet
  "EAI_AGAIN", // compose service name not resolvable yet
  "ENOTFOUND",
  "ETIMEDOUT",
  "57P03", // postgres: cannot_connect_now (still starting up)
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** True for errors that mean "the database is not reachable yet", not "the query failed". */
export function isDatabaseUnreachable(error: unknown): boolean {
  const code = errorCode(error);
  if (code && UNREACHABLE_CODES.has(code)) return true;
  return error instanceof Error && error.message.includes("Connection terminated due to connection timeout");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a startup step, retrying while the database is unreachable.
 *
 * After a host or Docker restart the backend can come up before postgres.
 * Retrying lets it recover by itself instead of crashing, which under nodemon
 * leaves the app down until someone edits a file.
 */
export async function retryWhileDatabaseUnreachable<T>(
  step: () => Promise<T>,
  options: {
    attempts: number;
    delayMs: number;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (error) {
      if (attempt >= options.attempts || !isDatabaseUnreachable(error)) throw error;
      options.onRetry?.(attempt, error);
      await sleep(options.delayMs);
    }
  }
}
