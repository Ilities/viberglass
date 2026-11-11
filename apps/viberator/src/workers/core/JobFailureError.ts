import type { JobFailureCode } from "@viberglass/types";

/**
 * A run failure whose cause is known where it is thrown. The job lifecycle
 * reports the code to the platform, which decides what people see; anything
 * thrown without one is reported as unrecognised.
 */
export class JobFailureError extends Error {
  constructor(
    readonly code: JobFailureCode,
    message: string,
    /** Work the failed run committed to the task's branch before it gave up. */
    readonly kept?: { commitHash: string; branch: string },
  ) {
    super(message);
    this.name = "JobFailureError";
  }
}

/** Runs a step and reports any error it throws with the given failure code, or the one it picks for that error. */
export async function failingWith<T>(
  code: JobFailureCode | ((error: unknown) => JobFailureCode),
  step: () => Promise<T>,
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof JobFailureError) throw error;
    throw new JobFailureError(
      typeof code === "function" ? code(error) : code,
      error instanceof Error ? error.message : String(error),
    );
  }
}
