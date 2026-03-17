import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class KimiCodeAgent extends BaseAgent {
  private readonly defaultModelName = "kimi-for-coding";
  private readonly defaultBaseUrl = "https://api.kimi.com/coding/v1";

  protected requiresApiKey(): boolean {
    return true;
  }

  public getAcpServerCommand(): string[] {
    return ["kimi", "acp"];
  }

  public override getAcpEnvironment(): NodeJS.ProcessEnv {
    return {
      ...(this.config.apiKey ? { KIMI_API_KEY: this.config.apiKey } : {}),
    };
  }

  private getNonEmptyTrimmedString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private resolveModelName(): string {
    return (
      this.getNonEmptyTrimmedString(this.config.model) ??
      this.getNonEmptyTrimmedString(process.env.KIMI_MODEL_NAME) ??
      this.defaultModelName
    );
  }

  private resolveBaseUrl(): string {
    return (
      this.getNonEmptyTrimmedString(this.config.endpoint) ??
      this.getNonEmptyTrimmedString(process.env.KIMI_BASE_URL) ??
      this.defaultBaseUrl
    );
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      const modelName = this.resolveModelName();
      const baseUrl = this.resolveBaseUrl();

      const programmaticConfig = {
        default_model: "viberator-kimi-model",
        providers: {
          "viberator-kimi-provider": {
            type: "kimi",
            base_url: baseUrl,
            // Keep a placeholder in args and inject the real key via env.
            api_key: "KIMI_API_KEY_FROM_ENV",
          },
        },
        models: {
          "viberator-kimi-model": {
            provider: "viberator-kimi-provider",
            model: modelName,
            max_context_size: 262144,
          },
        },
      };

      const args = [
        "--print",
        "--prompt",
        prompt,
        "--output-format",
        "stream-json",
        "--config",
        JSON.stringify(programmaticConfig),
        "--work-dir",
        repoDir,
      ];

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.config.apiKey) {
        env.KIMI_API_KEY = this.config.apiKey;
        // Preserve compatibility if config is switched to an OpenAI provider.
        env.OPENAI_API_KEY = env.OPENAI_API_KEY || this.config.apiKey;
      }
      env.KIMI_BASE_URL = baseUrl;
      env.KIMI_MODEL_NAME = modelName;
      if (typeof this.config.temperature === "number") {
        env.KIMI_MODEL_TEMPERATURE = this.config.temperature.toString();
      }

      let result;
      try {
        result = await this.executeCommand("kimi", args, {
          cwd: repoDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'kimi' CLI was not found. Install it with: curl -LsSf https://code.kimi.com/install.sh | bash",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `Kimi Code execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
      }

      const changedFiles = await this.gitService.getChangedFiles(repoDir);
      const cliOutput = this.parseCliOutput(result.stdout);

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
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
}
