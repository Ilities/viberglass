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
    ["Authentication required"],
  ])("recognises rejected credentials: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID);
  });

  it.each([
    ["Internal error: Session too large to compact - context exceeds model limit even after stripping media"],
    ["This model's maximum context length is 32768 tokens. However, you requested 40112 tokens"],
    ['{"error":{"code":"context_length_exceeded"}}'],
    ["prompt is too long: 210000 tokens > 200000 maximum"],
  ])("recognises requests too big for the model's context: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_CONTEXT_EXCEEDED);
  });

  it("treats anything else as the agent failing", () => {
    expect(classifyAgentFailure("Fake agent failed as instructed")).toBe(JOB_FAILURE_CODE.AGENT_FAILED);
    expect(classifyAgentFailure(undefined)).toBe(JOB_FAILURE_CODE.AGENT_FAILED);
  });
});
