import { JOB_FAILURE_CODE } from "@viberglass/types";
import { classifyAgentFailure } from "./classifyAgentFailure";

describe("classifyAgentFailure", () => {
  it("recognises a harness that went quiet", () => {
    expect(classifyAgentFailure("Agent stalled: its harness sent nothing for 20 minutes")).toBe(JOB_FAILURE_CODE.AGENT_STALLED);
  });

  it.each([
    ['{"type":"error","error":{"type":"insufficient_quota"}}'],
    ["Your credit balance is too low to access the Anthropic API"],
    ["You exceeded your current quota, please check your plan and billing details."],
    ["Quota exceeded. Check your plan and billing details. (429)"],
  ])("recognises an account with nothing left: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED);
  });

  it.each([
    ["429 Too Many Requests: rate_limit_error"],
    ["exceeded retry limit, last status: 429 Too Many Requests"],
    ["Token rate limit exceeded, please try again later."],
    ["The model provider refused the agent's request (HTTP 429): Go usage limit exceeded. The agent would wait 2 hours 19 minutes to try again, so the run stopped."],
    ["The model provider refused the agent's request: 5h usage limit reached. It will reset in 2 hours 14 minutes. The agent would wait 2 hours 14 minutes to try again, so the run stopped."],
    ["Go usage limit exceeded (provider.rate_limit, HTTP 429)"],
    ["RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content_requests per minute"],
  ])("recognises limits that lift by themselves: %s", (message) => {
    expect(classifyAgentFailure(message)).toBe(JOB_FAILURE_CODE.AGENT_RATE_LIMITED);
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
