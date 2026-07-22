import type { JobFailure } from "@viberglass/types";

export function classifyJobFailure(detail: string): JobFailure {
  if (/expired|invalid token|bad credentials|unauthorized|authentication failed/i.test(detail)) {
    return {
      code: "SCM_CREDENTIAL_INVALID",
      summary: "The source-control credential is missing, expired, or no longer accepted.",
      technicalDetail: detail,
      retryable: false,
    };
  }
  if (/quota|rate limit|credits|usage limit/i.test(detail)) {
    return {
      code: "AGENT_QUOTA_EXHAUSTED",
      summary: "The agent provider has no quota available for this run.",
      technicalDetail: detail,
      retryable: false,
    };
  }
  if (/no active clanker|runner|worker invocation|not available/i.test(detail)) {
    return {
      code: "AGENT_RUNNER_UNAVAILABLE",
      summary: "No agent runner was available to complete this run.",
      technicalDetail: detail,
      retryable: true,
    };
  }
  if (/clone|repository|permission denied|not found/i.test(detail)) {
    return {
      code: "REPOSITORY_ACCESS_FAILED",
      summary: "Viberglass could not access the configured repository.",
      technicalDetail: detail,
      retryable: false,
    };
  }
  return {
    code: "RUN_FAILED",
    summary: "The run stopped before it could finish.",
    technicalDetail: detail,
    retryable: true,
  };
}
