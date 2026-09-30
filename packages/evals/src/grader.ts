import type { CorpusRecord } from "./corpus";

/**
 * One grader's verdict on one run.
 *
 * `value` is 1 or 0 for pass/fail graders and a count for metric graders.
 * Null means the run cannot be graded yet (no PR, PR still open). It is
 * never scored as a failure.
 */
export interface Grade {
  value: number | null;
  reason: string;
}

export interface Grader {
  name: string;
  /**
   * Bumped whenever the grading rule changes, so grades made under different
   * rules are never averaged together. Recorded as `grader_version`.
   */
  version: string;
  kind: "pass_fail" | "count";
  grade(record: CorpusRecord): Grade;
}
