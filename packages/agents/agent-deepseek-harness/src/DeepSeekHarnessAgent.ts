import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import { Logger } from "winston";
import type { DeepSeekHarnessConfig } from "./config";

/**
 * DeepSeek Harness (dsh) coding agent harness. Task turns talk to it over ACP
 * through the `dsh-acp` adapter; a job without a session, such as a scheduled
 * one, runs `dsh --profile headless` once.
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

  /** `dsh-acp` bridges ACP JSON-RPC 2.0 over stdio and composes dsh in-process. Source: https://github.com/openma-ai/deepseek-harness-acp */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  private apiKey(): string | undefined {
    // A workspace model endpoint hands its key over as MODEL_ENDPOINT_API_KEY; dsh only reads DEEPSEEK_API_KEY.
    return this.config.apiKey || process.env.MODEL_ENDPOINT_API_KEY || undefined;
  }

  private model(): string | undefined {
    const value = typeof this.config.model === "string" ? this.config.model.trim() : undefined;
    return value || process.env.DSH_MODEL || undefined;
  }

  override configuredModel(): string | undefined {
    return this.model();
  }

  /** dsh-acp takes the credential, endpoint, model and permission preset straight from the environment. */
  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const apiKey = this.apiKey();
    if (apiKey) {
      env.DEEPSEEK_API_KEY = apiKey;
    }
    const model = this.model();
    if (model) {
      env.DSH_MODEL = model;
    }
    // Stated explicitly so a session never stops to prompt.
    env.DSH_PERMISSION_MODE = "workspace-write";
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
}
