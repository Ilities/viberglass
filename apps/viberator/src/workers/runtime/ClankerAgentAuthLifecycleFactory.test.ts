import { createLogger, transports } from "winston";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { ClankerAgentAuthLifecycleFactory } from "./ClankerAgentAuthLifecycleFactory";
import { CodexAgentAuthLifecycle } from "@viberglass/agent-codex";
import { NoopAgentAuthLifecycle } from "@viberglass/agent-core";

describe("ClankerAgentAuthLifecycleFactory", () => {
  const logger = createLogger({
    transports: [new transports.Console({ silent: true })],
  });
  const loginUploader = new CallbackClient(logger, {
    platformUrl: "http://localhost:8888",
  });
  const sendProgress = async (): Promise<void> => {};
  const context = { agentName: "codex", jobId: "job-1", tenantId: "tenant-1" };
  const authFailure = { success: false, changedFiles: [], executionTime: 0, cost: 0, errorMessage: "401 Unauthorized: token expired" };

  function create(input: { requestedAgent?: string; clankerConfig?: Record<string, unknown> }) {
    return new ClankerAgentAuthLifecycleFactory().create({
      ...input,
      logger,
      loginUploader,
      workDir: "/tmp/viberator-test",
      sendProgress,
    });
  }

  test("returns noop lifecycle for a harness without its own", () => {
    expect(create({ requestedAgent: "claude-code" })).toBeInstanceOf(NoopAgentAuthLifecycle);
  });

  test("returns the harness's lifecycle, signing in with an API key by default", () => {
    const lifecycle = create({ requestedAgent: "codex" });

    expect(lifecycle).toBeInstanceOf(CodexAgentAuthLifecycle);
    expect(lifecycle.shouldRetryAfterFailure(context, authFailure)).toBe(false);
  });

  test("signs in with the runner's chosen account from its v1 config", () => {
    const previousDefaultAgent = process.env.DEFAULT_AGENT;
    delete process.env.DEFAULT_AGENT;
    try {
      const lifecycle = create({
        clankerConfig: { version: 1, strategy: { type: "ecs" }, agent: { type: "codex", signIn: { method: "chatgpt" } } },
      });

      expect(lifecycle).toBeInstanceOf(CodexAgentAuthLifecycle);
      expect(lifecycle.shouldRetryAfterFailure(context, authFailure)).toBe(true);
    } finally {
      if (previousDefaultAgent !== undefined) process.env.DEFAULT_AGENT = previousDefaultAgent;
    }
  });
});
