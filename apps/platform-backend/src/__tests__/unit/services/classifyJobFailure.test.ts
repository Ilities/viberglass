import { classifyJobFailure } from "../../../services/job/classifyJobFailure";

describe("classifyJobFailure", () => {
  it.each([
    ["fatal: Authentication failed", "SCM_CREDENTIAL_INVALID", false],
    ["Provider usage limit reached", "AGENT_QUOTA_EXHAUSTED", false],
    ["No active clanker is available", "AGENT_RUNNER_UNAVAILABLE", true],
    ["Git clone failed: repository not found", "REPOSITORY_ACCESS_FAILED", false],
    ["Unexpected process exit", "RUN_FAILED", true],
  ])("classifies %s", (detail, code, retryable) => {
    expect(classifyJobFailure(detail)).toEqual(
      expect.objectContaining({ code, technicalDetail: detail, retryable }),
    );
  });
});
