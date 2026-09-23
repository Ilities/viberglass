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
  ) {
    super(message);
    this.name = "JobFailureError";
  }
}

/** Runs a step and reports any error it throws with the given failure code. */
export async function failingWith<T>(
  code: JobFailureCode,
  step: () => Promise<T>,
): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof JobFailureError) throw error;
    throw new JobFailureError(
      code,
      error instanceof Error ? error.message : String(error),
    );
  }
}
