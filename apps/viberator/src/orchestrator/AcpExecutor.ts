import { existsSync, writeFileSync, unlinkSync } from "fs";
import * as path from "path";
import { Logger } from "winston";
import { AcpClient } from "../acp/AcpClient";
import type { BaseAgent } from "../agents";
import type { ExecutionContext, ExecutionResult } from "../types";

export class AcpExecutor {
  constructor(private readonly logger: Logger) {}

  async execute(
    agent: BaseAgent,
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const command = agent.getAcpServerCommand();
    const repoDir = context.repoDir ?? process.cwd();
    const home = process.env.HOME;
    const workDir = path.dirname(repoDir);
    const harnessConfigDir = path.join(workDir, ".harness-config");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...agent.getAcpEnvironment(),
      // In Lambda the sandbox user's home dir may not physically exist; fall back to /tmp.
      HOME: home && existsSync(home) ? home : "/tmp",
      ...(existsSync(harnessConfigDir)
        ? { OPENCODE_CONFIG_DIR: harnessConfigDir }
        : {}),
    };

    // Ensure HOME is writable in Lambda. If HOME is not writable, some CLIs
    // (like OpenCode) fail during database migration or state initialization.
    if (process.env.AWS_LAMBDA_FUNCTION_NAME && env.HOME) {
      try {
        const testFile = path.join(env.HOME, `.write-test-${Date.now()}`);
        writeFileSync(testFile, "test");
        unlinkSync(testFile);
      } catch (err) {
        this.logger.warn(
          "HOME is not writable in Lambda, falling back to /tmp",
          {
            home: env.HOME,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        env.HOME = "/tmp";
      }
    }
    const timeoutMs = (context.maxExecutionTime || 1800) * 1000;

    this.logger.info("AcpExecutor starting", {
      command: command.join(" "),
      repoDir,
      timeoutMs,
      agentSessionId: context.agentSessionId,
      acpSessionId: context.acpSessionId,
    });

    const client = new AcpClient(
      command,
      repoDir,
      env,
      (event) => context.onAcpEvent?.(event),
      this.logger,
      timeoutMs,
    );

    try {
      const result = await client.run({
        userMessage: prompt,
        acpSessionId: context.acpSessionId,
      });

      this.logger.info("AcpExecutor completed", {
        turnOutcome: result.turnOutcome,
        acpSessionId: result.acpSessionId,
      });

      return {
        success: true,
        changedFiles: [],
        executionTime: 0,
        cost: 0,
        acpTurnOutcome: result.turnOutcome,
        newAcpSessionId: result.acpSessionId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("AcpExecutor failed", {
        command: command.join(" "),
        error: message,
        agentSessionId: context.agentSessionId,
      });
      throw error;
    }
  }
}
