import { JOB_FAILURE_CODE, type JobFailureCode } from "@viberglass/types";

const QUOTA =
  /insufficient[_ ]quota|quota|credit balance|out of credits|billing|rate[_ ]limit|too many requests|\b429\b|usage limit/i;
const CREDENTIAL =
  /invalid[_ ]api[_ ]key|invalid x-api-key|incorrect api key|authentication[_ ]error|unauthori[sz]ed|\b401\b|not logged in|please (run )?log ?in|api key (is )?(missing|not set|required)/i;

/**
 * Why an agent run failed, from the error its CLI reported.
 *
 * CLIs pass on the model provider's error as text, so this is the one place
 * a failure is recognised by its message. It only ever sees agent errors;
 * which pipeline stage failed is known structurally. Agent plugins can take
 * this over when their CLI reports structured errors.
 */
export function classifyAgentFailure(errorMessage: string | undefined): JobFailureCode {
  const message = errorMessage ?? "";
  if (QUOTA.test(message)) return JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED;
  if (CREDENTIAL.test(message)) return JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID;
  return JOB_FAILURE_CODE.AGENT_FAILED;
}
