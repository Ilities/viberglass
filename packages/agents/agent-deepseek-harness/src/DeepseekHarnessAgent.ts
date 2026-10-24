import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import type { Logger } from "winston";
import type { DeepseekHarnessConfig } from "./config";

/**
 * DeepSeek Harness. Task turns talk to it over ACP via `dsh-acp`; one-shot
 * jobs run `dsh` in headless mode.
 */
export class DeepseekHarnessAgent extends BaseAgent<DeepseekHarnessConfig> {
  constructor(config: DeepseekHarnessConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /** The command that starts the harness's ACP server on stdio. */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  public override getAcpEnvironment(harnessConfigDir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    if (this.config.apiKey) {
      env.DEEPSEEK_API_KEY = this.config.apiKey;
    }
    env.DSH_PERMISSION_MODE = "workspace-write";
    if (this.config.model) {
      env.DSH_MODEL = this.config.model;
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

      const args = ["--profile", "headless", prompt];

      let result;
      try {
        result = await this.executeCommand("dsh", args, {
          cwd: repoDir,
          env: this.getAcpEnvironment(path.join(workDir, ".harness-config")),
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error("The 'dsh' CLI was not found. Install it with: npm install -g @deepseek-ai/dsh");
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(`DeepSeek Harness failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`);
      }

      await this.cleanup(workDir);
      return { success: true };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
