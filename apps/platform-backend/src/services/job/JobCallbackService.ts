import { createHash, timingSafeEqual } from "crypto";
import db from "../../persistence/config/database";

/**
 * Callback token operations for jobs.
 * Handles validating and retrieving callback tokens for worker authentication.
 */

/**
 * Validate a callback token for a job.
 * Used to authenticate worker callbacks (SEC-05).
 * @returns true if the token is valid, false otherwise
 */
export async function validateCallbackToken(
  jobId: string,
  token: string,
): Promise<boolean> {
  if (!token || token.length === 0) {
    return false;
  }

  const job = await db
    .selectFrom("jobs")
    .select(["callback_token"])
    .where("id", "=", jobId)
    .executeTakeFirst();

  return callbackTokensMatch(job?.callback_token ?? null, token);
}

/** Compares in constant time; hashing first keeps tokens of different lengths comparable. */
export function callbackTokensMatch(stored: string | null, given: string): boolean {
  if (!stored || !given) return false;
  return timingSafeEqual(digest(stored), digest(given));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Get the callback token for a job.
 * Used by invokers to pass to workers.
 */
export async function getCallbackToken(jobId: string): Promise<string | null> {
  const job = await db
    .selectFrom("jobs")
    .select(["callback_token"])
    .where("id", "=", jobId)
    .executeTakeFirst();

  return job?.callback_token ?? null;
}
