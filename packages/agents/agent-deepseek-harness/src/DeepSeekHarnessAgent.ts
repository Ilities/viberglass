import * as path from "path";
import { BaseAgent, currentModelEndpoint, modelEndpointKey } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import type { Logger } from "winston";
import type { DeepSeekHarnessConfig } from "./config";

/**
 * DeepSeek Harness. Task turns talk to it over ACP via `dsh-acp`; one-shot
 * jobs run `dsh headless`, which answers one task and exits.
 */
export class DeepSeekHarnessAgent extends BaseAgent<DeepSeekHarnessConfig> {
  constructor(config: DeepSeekHarnessConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return !currentModelEndpoint();
  }

  /** The command that starts the harness's ACP server on stdio. */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    const endpoint = currentModelEndpoint();
    if (endpoint) {
      return {
        DEEPSEEK_BASE_URL: endpoint.baseUrl,
        // dsh-acp only reads the key from DEEPSEEK_API_KEY; an unauthenticated
        // endpoint still needs a value to pass its credential gate.
        DEEPSEEK_API_KEY: endpoint.auth.scheme === "none" ? "unused" : modelEndpointKey(),
        DSH_MODEL: endpoint.model,
        DSH_PERMISSION_MODE: "workspace-write",
      };
    }
    return {
      ...(this.config.apiKey ? { DEEPSEEK_API_KEY: this.config.apiKey } : {}),
      ...(this.config.model ? { DSH_MODEL: this.config.model } : {}),
      DSH_PERMISSION_MODE: "workspace-write",
    };
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
        result = await this.executeCommand("dsh", ["headless", prompt], {
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
