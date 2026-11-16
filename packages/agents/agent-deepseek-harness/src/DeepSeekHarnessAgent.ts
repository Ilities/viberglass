import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import { Logger } from "winston";
import type { DeepSeekHarnessConfig } from "./config";

/**
 * DeepSeek Harness (`dsh`) harness.
 *
 * One-shot execution: runs `dsh --profile headless <prompt>` in the repo via executeAgentCLI.
 * Interactive sessions: ACP bridge via `dsh-acp`, which composes the harness in-process.
 *
 * Install: npm install -g @deepseek-ai/dsh @openma/deepseek-harness-acp
 */
export class DeepSeekHarnessAgent extends BaseAgent<DeepSeekHarnessConfig> {
  constructor(config: DeepSeekHarnessConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /** The command that starts the harness's ACP server on stdio. */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  /**
   * Environment for dsh-acp and one-shot dsh. The permission mode is stated
   * explicitly, the adapter's own default, so a run never stops to prompt.
   */
  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return this.dshEnvironment();
  }

  private dshEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { DSH_PERMISSION_MODE: "workspace-write" };
    if (this.config.apiKey) {
      env.DEEPSEEK_API_KEY = this.config.apiKey;
    }
    return env;
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      this.logger.info("Executing DeepSeek Harness (one-shot)", { repoDir });

      let result;
      try {
        result = await this.executeCommand("dsh", ["--profile", "headless", prompt], {
          cwd: repoDir,
          env: this.dshEnvironment(),
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'dsh' CLI was not found. Install it with: npm install -g @deepseek-ai/dsh",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `DeepSeek Harness execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
      }

      await this.cleanup(workDir);

      return { success: true };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
