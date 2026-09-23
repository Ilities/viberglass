import { JOB_FAILURE_CODE } from "@viberglass/types";
import { classifyAgentFailure } from "./classifyAgentFailure";

describe("classifyAgentFailure", () => {
  it.each([
    ['{"type":"error","error":{"type":"insufficient_quota"}}'],
    ["Your credit balance is too low to access the Anthropic API"],
    ["429 Too Many Requests: rate_limit_error"],
  ])("recognises provider quota errors: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED);
  });

  it.each([
    ["401 invalid x-api-key"],
    ["Incorrect API key provided: sk-..."],
    ["authentication_error: invalid bearer token"],
    ["Not logged in. Please run /login"],
  ])("recognises rejected credentials: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID);
  });

  it("treats anything else as the agent failing", () => {
    expect(classifyAgentFailure("Fake agent failed as instructed")).toBe(JOB_FAILURE_CODE.AGENT_FAILED);
    expect(classifyAgentFailure(undefined)).toBe(JOB_FAILURE_CODE.AGENT_FAILED);
  });
});
