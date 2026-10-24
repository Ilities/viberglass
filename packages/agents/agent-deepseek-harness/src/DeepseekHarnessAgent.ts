import * as path from "path";
import { BaseAgent, currentModelEndpoint, modelEndpointKey } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import type { Logger } from "winston";
import type { DeepseekHarnessConfig } from "./config";

/**
 * DeepSeek Harness (`dsh`). Task turns talk to it over ACP through the
 * `dsh-acp` adapter; a job without a session runs `dsh --profile headless` once.
 */
export class DeepseekHarnessAgent extends BaseAgent<DeepseekHarnessConfig> {
  constructor(config: DeepseekHarnessConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /** `dsh-acp` serves ACP over stdio and runs the dsh runtime itself. */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  /**
   * The adapter reads DEEPSEEK_API_KEY. Permission mode is set explicitly so a
   * run never waits on an approval prompt.
   */
  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return { DEEPSEEK_API_KEY: this.deepSeekKey(), DSH_PERMISSION_MODE: "workspace-write" };
  }

  protected async executeAgentCLI(prompt: string, context: ExecutionContext, workDir: string): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      this.logger.info("Executing DeepSeek Harness (one-shot)", { repoDir });

      let result;
      try {
        result = await this.executeCommand("dsh", ["--profile", "headless", prompt], {
          cwd: repoDir,
          env: this.getAcpEnvironment(path.join(workDir, ".harness-config")),
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

  /** On a workspace model endpoint the endpoint's key replaces the runner's. */
  private deepSeekKey(): string {
    return currentModelEndpoint() ? modelEndpointKey() : (this.config.apiKey ?? "");
  }
}
