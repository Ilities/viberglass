import { ViberatorBaseAgent } from "./ViberatorBaseAgent";
import type { OpenCodeConfig, ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import { Logger } from "winston";
import * as fs from "fs";
import * as path from "path";

export class OpenCodeAgent extends ViberatorBaseAgent<OpenCodeConfig> {
  constructor(config: OpenCodeConfig, logger: Logger) {
    super(config, logger);
  }
  private getNonEmptyTrimmedString(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  protected requiresApiKey(): boolean {
    // OpenCode can resolve provider credentials from several env keys.
    return false;
  }

  public getAcpServerCommand(): string[] {
    return ["opencode", "acp"];
  }

  public override getAcpEnvironment(harnessConfigDir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    if (this.config.apiKey) {
      env.OPENCODE_API_KEY = this.config.apiKey;
      env.OPENAI_API_KEY = this.config.apiKey;
    }
    const endpoint =
      this.getNonEmptyTrimmedString(this.config.endpoint) ??
      this.getNonEmptyTrimmedString(process.env.OPENCODE_BASE_URL);
    if (endpoint) {
      env.OPENCODE_BASE_URL = endpoint;
      env.OPENAI_BASE_URL = endpoint;
    }
    if (fs.existsSync(harnessConfigDir)) {
      env.OPENCODE_CONFIG_DIR = harnessConfigDir;
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

      let effectivePrompt = prompt;
      if (context.maxChanges) {
        effectivePrompt += `\n\nLimit changes to ${context.maxChanges} files.`;
      }
      if (context.testRequired) {
        effectivePrompt +=
          "\n\nRun tests to verify your changes before finishing.";
      }

      const args = ["run", "--format", "json"];

      const model =
        this.getNonEmptyTrimmedString(this.config.model) ??
        this.getNonEmptyTrimmedString(process.env.OPENCODE_MODEL);
      if (model) {
        args.push("--model", model);
      }

      args.push(effectivePrompt);

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.config.apiKey) {
        env.OPENCODE_API_KEY = this.config.apiKey;
        env.OPENAI_API_KEY = env.OPENAI_API_KEY || this.config.apiKey;
      }
      const endpoint =
        this.getNonEmptyTrimmedString(this.config.endpoint) ??
        this.getNonEmptyTrimmedString(process.env.OPENCODE_BASE_URL) ??
        this.getNonEmptyTrimmedString(process.env.OPENAI_BASE_URL);
      if (endpoint) {
        env.OPENCODE_BASE_URL = endpoint;
        env.OPENAI_BASE_URL = env.OPENAI_BASE_URL || endpoint;
      }

      const harnessConfigDir = path.join(workDir, ".harness-config");
      if (fs.existsSync(harnessConfigDir)) {
        env.OPENCODE_CONFIG_DIR = harnessConfigDir;
      }
      env.HOME = this.resolveHomeDirectory(env.HOME);

      this.logger.info("Executing OpenCode CLI", {
        args,
        workDir: repoDir,
        env: {
          HOME: env.HOME,
          OPENCODE_CONFIG_DIR: env.OPENCODE_CONFIG_DIR,
          OPENCODE_BASE_URL: env.OPENCODE_BASE_URL,
          HAS_API_KEY: !!env.OPENCODE_API_KEY,
        },
      });

      let result;
      try {
        result = await this.executeCommand("opencode", args, {
          cwd: repoDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'opencode' CLI was not found. Install it with: npm install -g opencode-ai@latest",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `OpenCode execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
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
