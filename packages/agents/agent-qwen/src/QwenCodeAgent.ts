import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, IAgentGitService, ExecutionContext } from "@viberglass/agent-core";
import { Logger } from "winston";
import * as path from "path";
import type { QwenCodeConfig } from "./config";

export class QwenCodeAgent extends BaseAgent<QwenCodeConfig> {
  constructor(config: QwenCodeConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  private readonly defaultCompatibleBaseUrl =
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  private readonly defaultModel = "qwen3-coder-plus";

  protected requiresApiKey(): boolean {
    return true;
  }

  public getAcpServerCommand(): string[] {
    return ["qwen", "--acp", "--yolo"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    const endpoint = this.resolveCompatibleBaseUrl();
    return {
      DASHSCOPE_API_KEY: this.config.apiKey!,
      OPENAI_API_KEY: this.config.apiKey!,
      OPENAI_BASE_URL: endpoint,
      OPENAI_MODEL: this.resolveModelName(),
    };
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    return this.executeViaCLI(prompt, context, workDir);
  }

  private async executeViaCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const args = this.buildCliArgs(prompt, context);
      const endpoint = this.resolveCompatibleBaseUrl();

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DASHSCOPE_API_KEY: this.config.apiKey!,
        OPENAI_API_KEY: this.config.apiKey!,
        OPENAI_BASE_URL: endpoint,
        OPENAI_MODEL: this.resolveModelName(),
      };

      const cliBinary = "qwen";
      this.logger.info(`Executing ${cliBinary}`, { args });

      let result;
      try {
        result = await this.executeCommand(cliBinary, args, {
          cwd: repoDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'qwen' CLI was not found. Install it with: npm install -g @qwen-code/qwen-code",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(`${cliBinary} failed: ${result.stderr}`);
      }

      const cliOutput = this.parseCliOutput(result.stdout);

      await this.cleanup(workDir);

      return {
        success: true,
        commitHash: this.getCliString(cliOutput, "commitHash", "commit"),
        pullRequestUrl: this.getCliString(
          cliOutput,
          "pullRequestUrl",
          "pr_url",
        ),
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }

  private buildCliArgs(prompt: string, context: ExecutionContext): string[] {
    const promptSections: string[] = [prompt];
    if (context.maxChanges) {
      promptSections.push(`Limit changes to ${context.maxChanges} files.`);
    }
    if (context.testRequired) {
      promptSections.push(
        "Before finishing, run relevant tests and fix any failures.",
      );
    }

    const args = [
      "--auth-type",
      "openai",
      "--prompt",
      promptSections.join("\n\n"),
      "--output-format",
      "stream-json",
      "--yolo",
    ];

    const modelName = this.resolveModelName();
    if (modelName.length > 0) {
      args.push("--model", modelName);
    }

    return args;
  }

  private resolveModelName(): string {
    if (typeof this.config.model === "string") {
      const trimmed = this.config.model.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return this.defaultModel;
  }

  private resolveCompatibleBaseUrl(): string {
    if (typeof this.config.endpoint === "string") {
      const trimmed = this.config.endpoint.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return this.defaultCompatibleBaseUrl;
  }
}
