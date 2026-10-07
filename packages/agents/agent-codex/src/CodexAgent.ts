import { BaseAgent, currentModelEndpoint } from "@viberglass/agent-core";
import type { AgentCLIResult, IAgentGitService, ExecutionContext } from "@viberglass/agent-core";
import { Logger } from "winston";
import * as path from "path";
import type { CodexConfig } from "./config";
import { writeCodexModelConfig } from "./codexModelConfig";

/**
 * What Codex keeps when it compacts its context. It has no instructions on
 * its compact command, only this prompt in its config.
 */
export const CODEX_COMPACT_PROMPT = [
  "Summarise this conversation for whoever carries on with the task, you included, after the earlier messages are gone.",
  "Keep the decisions made on the task and who agreed to each, the open questions and whom they're for, what has been built so far and what's left to do.",
  "SUMMARY.md in the repository holds the latest summary of the conversation; keep what still holds in it.",
].join(" ");

export class CodexAgent extends BaseAgent<CodexConfig> {
  constructor(config: CodexConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    if (currentModelEndpoint()) return false;
    const authMode = process.env.CODEX_AUTH_MODE || "api_key";
    return authMode === "api_key";
  }

  public getAcpServerCommand(): string[] {
    return ["codex-acp"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    const endpoint = currentModelEndpoint();
    if (endpoint) {
      writeCodexModelConfig(
        endpoint,
        process.env.CODEX_HOME ||
          process.env.CODEX_CONFIG_DIR ||
          path.join(this.resolveHomeDirectory(process.env.HOME), ".codex"),
      );
      return {
        OPENAI_API_KEY: undefined,
        OPENAI_BASE_URL: undefined,
        CODEX_CONFIG: JSON.stringify({
          compact_prompt: CODEX_COMPACT_PROMPT,
          model: endpoint.model,
          model_provider: "viberglass",
        }),
      };
    }
    return {
      OPENAI_API_KEY:
        (process.env.CODEX_AUTH_MODE || "api_key") === "api_key"
          ? this.config.apiKey
          : undefined,
      OPENAI_BASE_URL: this.config.endpoint || undefined,
      // codex-acp merges this into each session's config.
      CODEX_CONFIG: JSON.stringify({ compact_prompt: CODEX_COMPACT_PROMPT }),
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
      const userPrompt = context.testRequired
        ? `${prompt}\n\nBefore finishing, run relevant tests and fix any failures.`
        : prompt;

      const args = [
        "--yolo",
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--cd",
        repoDir,
      ];

      if (typeof this.config.model === "string" && this.config.model.trim()) {
        args.push("--model", this.config.model.trim());
      }

      args.push("--", userPrompt);

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        OPENAI_API_KEY:
          (process.env.CODEX_AUTH_MODE || "api_key") === "api_key"
            ? this.config.apiKey
            : undefined,
        OPENAI_BASE_URL: this.config.endpoint || undefined,
      };

      let result;
      try {
        result = await this.executeCommand("codex", args, {
          cwd: workDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'codex' CLI was not found. Install it from: https://developers.openai.com/codex/cli",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(`Codex CLI failed: ${result.stderr}`);
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
        testResults: Array.isArray(cliOutput.test_results)
          ? cliOutput.test_results
          : undefined,
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
