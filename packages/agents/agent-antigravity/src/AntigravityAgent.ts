import { AcpExecutor, BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, IAgentGitService, ExecutionContext } from "@viberglass/agent-core";
import { Logger } from "winston";
import * as path from "path";
import type { AntigravityConfig } from "./config";
import { writeApiKeyAuthSettings } from "./antigravitySettings";

export type AcpTurnRunner = Pick<AcpExecutor, "execute">;

/**
 * Google Antigravity harness. The worker image carries only Google's ACP
 * server, not the `agy` CLI, so one-shot runs also go through ACP, as a single turn.
 */
export class AntigravityAgent extends BaseAgent<AntigravityConfig> {
  private readonly acpExecutor: AcpTurnRunner;

  constructor(
    config: AntigravityConfig,
    logger: Logger,
    gitService?: IAgentGitService,
    acpExecutor?: AcpTurnRunner,
  ) {
    super(config, logger, gitService);
    this.acpExecutor = acpExecutor ?? new AcpExecutor(logger);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  public getAcpServerCommand(): string[] {
    // The Linux build needs an explicit empty uid.
    return ["agy_acp_server.par", "--uid="];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    writeApiKeyAuthSettings(this.resolveHomeDirectory(process.env.HOME));

    const env: NodeJS.ProcessEnv = {
      GEMINI_API_KEY: this.config.apiKey,
      // Workers run in throwaway sandboxes; there is nobody to answer a trust prompt.
      AGY_ACP_DISABLE_WORKSPACE_TRUST: "1",
    };
    const model = this.config.model?.trim();
    if (model) {
      env.AGY_ACP_DEFAULT_MODEL = model;
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

      this.logger.info("Executing Antigravity (one-shot ACP turn)", { repoDir });
      await this.acpExecutor.execute(this, prompt, { ...context, repoDir });

      return { success: true };
    } finally {
      await this.cleanup(workDir);
    }
  }
}
