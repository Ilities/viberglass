import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import type { Logger } from "winston";
import type { __PascalName__Config } from "./config";

/**
 * __DISPLAY_NAME__ harness. Task turns talk to it over ACP: the worker starts
 * `getAcpServerCommand()` with `getAcpEnvironment()`. A job without a session,
 * such as a scheduled one, runs the CLI once through `executeAgentCLI`.
 */
export class __PascalName__Agent extends BaseAgent<__PascalName__Config> {
  constructor(config: __PascalName__Config, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /** The command that starts the harness's ACP server on stdio. */
  public getAcpServerCommand(): string[] {
    // TODO: the CLI's ACP mode, or its ACP adapter.
    return ["__name__", "--acp"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return { __NAME_UPPER___API_KEY: this.config.apiKey };
  }

  protected async executeAgentCLI(prompt: string, context: ExecutionContext, workDir: string): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      // TODO: the CLI's one-shot, non-interactive mode.
      const result = await this.executeCommand("__name__", ["--print", prompt], {
        cwd: path.join(workDir, "repo"),
        env: this.getAcpEnvironment(path.join(workDir, ".harness-config")),
        timeout: this.config.executionTimeLimit * 1000,
      });
      if (result.exitCode !== 0) {
        throw new Error(`__DISPLAY_NAME__ failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
      }
      return { success: true };
    } finally {
      await this.cleanup(workDir);
    }
  }
}
