import {
  getAgentCatalogEntry,
  JOB_FAILURE_CODE,
  type JobFailure,
  type JobFailureCategory,
  type JobFailureCode,
} from "@viberglass/types";

interface FailureDescription {
  title: string;
  summary: string;
  category: JobFailureCategory;
  retryable: boolean;
}

const FAILURES: Record<JobFailureCode, FailureDescription> = {
  [JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED]: {
    title: "Repository not reachable",
    summary:
      "The agent couldn't open the repository. The repository address may be wrong, or its credential can't read it.",
    category: "setup",
    retryable: false,
  },
  [JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED]: {
    title: "Couldn't push changes",
    summary:
      "The agent made changes but couldn't push them or open a pull request. The repository credential probably can't write.",
    category: "setup",
    retryable: false,
  },
  [JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID]: {
    title: "Model key rejected",
    summary: "The model provider rejected the agent's API key or login.",
    category: "setup",
    retryable: false,
  },
  [JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED]: {
    title: "Model quota used up",
    summary:
      "The model provider refused the request because of quota, credit or rate limits.",
    category: "setup",
    retryable: true,
  },
  [JOB_FAILURE_CODE.AGENT_CONTEXT_EXCEEDED]: {
    title: "Model context exceeded",
    summary:
      "The agent's request didn't fit the model's context window, so the model refused it.",
    category: "setup",
    retryable: false,
  },
  [JOB_FAILURE_CODE.AGENT_FAILED]: {
    title: "Agent failed",
    summary: "The agent stopped with an error before finishing.",
    category: "agent",
    retryable: true,
  },
  [JOB_FAILURE_CODE.AGENT_STALLED]: {
    title: "Agent stalled",
    summary:
      "The agent stopped making progress partway through, so the run was stopped. Any code it had changed was kept on the task's branch.",
    category: "agent",
    retryable: true,
  },
  [JOB_FAILURE_CODE.AGENT_NO_DOCUMENT]: {
    title: "No document written",
    summary: "The agent finished without writing the document it was asked for.",
    category: "agent",
    retryable: true,
  },
  [JOB_FAILURE_CODE.AGENT_NO_CHANGES]: {
    title: "No code changes",
    summary:
      "The agent finished without changing any code, so there is no pull request.",
    category: "agent",
    retryable: true,
  },
  [JOB_FAILURE_CODE.FILES_RESTORE_FAILED]: {
    title: "Files couldn't be restored",
    summary: "The run couldn't load the space's saved files, so the agent didn't start. The saved files are unchanged.",
    category: "platform",
    retryable: true,
  },
  [JOB_FAILURE_CODE.FILES_SAVE_FAILED]: {
    title: "Files weren't saved",
    summary: "The run couldn't save the agent's files, so the space keeps its earlier files.",
    category: "platform",
    retryable: true,
  },
  [JOB_FAILURE_CODE.ARTIFACT_INVALID]: {
    title: "No valid artifact",
    summary: "The agent was asked for an artifact but didn't declare a valid one. Its files were saved.",
    category: "agent",
    retryable: true,
  },
  [JOB_FAILURE_CODE.RUNNER_UNAVAILABLE]: {
    title: "Agent couldn't start",
    summary: "No agent runner could be started for this run.",
    category: "setup",
    retryable: true,
  },
  [JOB_FAILURE_CODE.RUNNER_OUT_OF_MEMORY]: {
    title: "Worker ran out of memory",
    summary: "The agent's worker used more memory than its runner allows and was stopped. Give the runner more memory, then try again.",
    category: "setup",
    retryable: false,
  },
  [JOB_FAILURE_CODE.RUN_LOST]: {
    title: "Agent stopped responding",
    summary: "The agent stopped reporting progress, so the run was given up.",
    category: "platform",
    retryable: true,
  },
  [JOB_FAILURE_CODE.RUN_FAILED]: {
    title: "Something went wrong",
    summary:
      "The run failed for a reason Viberglass didn't recognise. This is likely a Viberglass problem, not yours.",
    category: "platform",
    retryable: true,
  },
};

function isJobFailureCode(code: string): code is JobFailureCode {
  return Object.prototype.hasOwnProperty.call(FAILURES, code);
}

/** What the run's harness adds to a failure, such as how long it takes to give up on a rejected key. */
function harnessNote(code: JobFailureCode, agent: string | undefined): string | undefined {
  if (code !== JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID || !agent) return undefined;
  return getAgentCatalogEntry(agent)?.rejectedKeyNote ?? undefined;
}

/**
 * Turns a failure code, reported where the failure happened, into what people
 * see. Unknown or missing codes are treated as an unrecognised failure.
 */
export function describeJobFailure(
  code: string | undefined,
  technicalDetail?: string,
  agent?: string,
): JobFailure {
  const knownCode =
    code && isJobFailureCode(code) ? code : JOB_FAILURE_CODE.RUN_FAILED;
  const description = FAILURES[knownCode];
  const note = harnessNote(knownCode, agent);
  return {
    code: knownCode,
    ...description,
    ...(note ? { summary: `${description.summary} ${note}` } : {}),
    ...(technicalDetail ? { technicalDetail } : {}),
  };
}
