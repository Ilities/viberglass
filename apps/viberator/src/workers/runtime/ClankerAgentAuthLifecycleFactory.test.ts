import { createLogger, transports } from "winston";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { ClankerAgentAuthLifecycleFactory } from "./ClankerAgentAuthLifecycleFactory";
import { CodexAgentAuthLifecycle } from "./CodexAgentAuthLifecycle";
import { NoopAgentAuthLifecycle } from "./NoopAgentAuthLifecycle";

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

  test("returns codex lifecycle when clanker config agent is codex", () => {
    const previousMode = process.env.CODEX_AUTH_MODE;
    const previousSecretName = process.env.CODEX_AUTH_SECRET_NAME;

    try {
      delete process.env.CODEX_AUTH_MODE;
      delete process.env.CODEX_AUTH_SECRET_NAME;

      const factory = new ClankerAgentAuthLifecycleFactory();
      const lifecycle = factory.create({
        clankerConfig: { agent: "codex" },
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
});
