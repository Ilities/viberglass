import { createLogger, transports } from "winston";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { ClankerAgentAuthLifecycleFactory } from "./ClankerAgentAuthLifecycleFactory";
import { CodexAgentAuthLifecycle } from "@viberglass/agent-codex";
import { NoopAgentAuthLifecycle } from "@viberglass/agent-core";

describe("ClankerAgentAuthLifecycleFactory", () => {
  const logger = createLogger({
    transports: [new transports.Console({ silent: true })],
  });
  const callbackClient = new CallbackClient(logger, {
    platformUrl: "http://localhost:8888",
  });
  const sendProgress = async (): Promise<void> => {};

  test("returns noop lifecycle for non-codex agents", () => {
    const factory = new ClankerAgentAuthLifecycleFactory();
    const lifecycle = factory.create({
      requestedAgent: "claude",
      logger,
      callbackClient,
      workDir: "/tmp/viberator-test",
      sendProgress,
    });

    expect(lifecycle).toBeInstanceOf(NoopAgentAuthLifecycle);
  });

  test("returns codex lifecycle when requested agent is codex", () => {
    const previousMode = process.env.CODEX_AUTH_MODE;
    const previousSecretName = process.env.CODEX_AUTH_SECRET_NAME;

    try {
      delete process.env.CODEX_AUTH_MODE;
      delete process.env.CODEX_AUTH_SECRET_NAME;

      const factory = new ClankerAgentAuthLifecycleFactory();
      const lifecycle = factory.create({
        requestedAgent: "codex",
        logger,
        callbackClient,
        workDir: "/tmp/viberator-test",
        sendProgress,
      });

      expect(lifecycle).toBeInstanceOf(CodexAgentAuthLifecycle);
      expect(process.env.CODEX_AUTH_MODE).toBeDefined();
      expect(process.env.CODEX_AUTH_SECRET_NAME).toBeDefined();
    } finally {
      if (previousMode === undefined) {
        delete process.env.CODEX_AUTH_MODE;
      } else {
        process.env.CODEX_AUTH_MODE = previousMode;
      }

      if (previousSecretName === undefined) {
        delete process.env.CODEX_AUTH_SECRET_NAME;
      } else {
        process.env.CODEX_AUTH_SECRET_NAME = previousSecretName;
      }
    }
  });

  test("detects codex agent from v1 deployment config and applies stored mode", () => {
    const previousMode = process.env.CODEX_AUTH_MODE;
    const previousSecretName = process.env.CODEX_AUTH_SECRET_NAME;
    const previousDefaultAgent = process.env.DEFAULT_AGENT;

    try {
      delete process.env.CODEX_AUTH_MODE;
      delete process.env.CODEX_AUTH_SECRET_NAME;
      delete process.env.DEFAULT_AGENT;

      const factory = new ClankerAgentAuthLifecycleFactory();
      const lifecycle = factory.create({
        clankerConfig: {
          version: 1,
          strategy: { type: "ecs" },
          agent: {
            type: "codex",
            codexAuth: { mode: "chatgpt_device_stored" },
          },
        },
        logger,
        callbackClient,
        workDir: "/tmp/viberator-test",
        sendProgress,
      });

      expect(lifecycle).toBeInstanceOf(CodexAgentAuthLifecycle);
      expect(process.env.CODEX_AUTH_MODE).toBe("chatgpt_device_stored");
      expect(process.env.CODEX_AUTH_SECRET_NAME).toBe("CODEX_AUTH_JSON");
    } finally {
      if (previousMode === undefined) {
        delete process.env.CODEX_AUTH_MODE;
      } else {
        process.env.CODEX_AUTH_MODE = previousMode;
      }

      if (previousSecretName === undefined) {
        delete process.env.CODEX_AUTH_SECRET_NAME;
      } else {
        process.env.CODEX_AUTH_SECRET_NAME = previousSecretName;
      }

      if (previousDefaultAgent === undefined) {
        delete process.env.DEFAULT_AGENT;
      } else {
        process.env.DEFAULT_AGENT = previousDefaultAgent;
      }
    }
  });
});
