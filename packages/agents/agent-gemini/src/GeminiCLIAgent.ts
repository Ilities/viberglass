import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, IAgentGitService, ExecutionContext } from "@viberglass/agent-core";
import { Logger } from "winston";
import * as path from "path";
import type { GeminiConfig } from "./config";

export class GeminiCLIAgent extends BaseAgent<GeminiConfig> {
  constructor(config: GeminiConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  public getAcpServerCommand(): string[] {
    return ["gemini", "--experimental-acp"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return {
      GEMINI_API_KEY: this.config.apiKey!,
      GOOGLE_API_KEY: this.config.apiKey!,
    };
  }

  private getNonEmptyTrimmedString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private buildPrompt(prompt: string, context: ExecutionContext): string {
    const sections: string[] = [prompt];

    if (context.maxChanges) {
      sections.push(`Limit changes to ${context.maxChanges} files.`);
    }

    if (context.testRequired) {
      sections.push(
        "Before finishing, run relevant tests and fix any failures.",
      );
    }

    return sections.join("\n\n");
  }

  private resolveApprovalMode(): "default" | "auto_edit" | "yolo" {
    const configured = this.getNonEmptyTrimmedString(this.config.approvalMode);
    if (
      configured === "default" ||
      configured === "auto_edit" ||
      configured === "yolo"
    ) {
      return configured;
    }

    return "yolo";
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const effectivePrompt = this.buildPrompt(prompt, context);
      const args = [
        "--output-format",
        "json",
        "--approval-mode",
        this.resolveApprovalMode(),
      ];

      const model = this.getNonEmptyTrimmedString(this.config.model);
      if (model) {
        args.push("--model", model);
      }

      args.push(effectivePrompt);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        GEMINI_API_KEY: this.config.apiKey!,
        GOOGLE_API_KEY: this.config.apiKey!,
      };

      if (this.getNonEmptyTrimmedString(this.config.endpoint)) {
        this.logger.warn(
          "Gemini endpoint overrides are not supported via CLI flags and will be ignored.",
        );
      }

      const cliBinary = "gemini";
      this.logger.info(`Executing ${cliBinary}`, {
        args,
      });

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
            "The 'gemini' CLI was not found. Install it with: npm install -g @google/gemini-cli",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `Gemini CLI failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
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
}
