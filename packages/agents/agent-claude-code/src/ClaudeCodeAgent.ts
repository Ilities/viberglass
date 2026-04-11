import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, IAgentGitService, ExecutionContext } from "@viberglass/agent-core";
import { Logger } from "winston";
import * as path from "path";
import type { ClaudeCodeConfig } from "./config";

export class ClaudeCodeAgent extends BaseAgent<ClaudeCodeConfig> {
  constructor(config: ClaudeCodeConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  public getAcpServerCommand(): string[] {
    return ["claude-agent-acp"];
  }

  public override getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return {
      ANTHROPIC_API_KEY: this.config.apiKey!,
      CLAUDE_CODE_NON_INTERACTIVE: "true",
      ANTHROPIC_MODEL: (this.config.model as string) || undefined,
      ANTHROPIC_BASE_URL: this.config.endpoint || undefined,
    };
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      // Clone repository
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      this.logger.info("Executing Claude Code CLI", {
        repoDir,
        testRequired: context.testRequired,
      });

      // Prepare Claude Code CLI command for one-shot execution
      // -p: Print mode (non-interactive)
      // --dangerously-skip-permissions: Required for automated environments
      const args = [
        "--print",
        prompt,
        "--output-format=stream-json",
        "--dangerously-skip-permissions",
      ];

      if (context.maxChanges) {
        args.push(
          "--append-system-prompt",
          `Limit changes to ${context.maxChanges} files.`,
        );
      }

      if (context.testRequired) {
        args.push("--append-system-prompt", "Run tests to verify changes.");
      }

      let result;

      try {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          ANTHROPIC_API_KEY: this.config.apiKey!,
          CLAUDE_CODE_NON_INTERACTIVE: "true",
          ANTHROPIC_MODEL: (this.config.model as string) || undefined,
          ANTHROPIC_BASE_URL: this.config.endpoint || undefined,
        };

        result = await this.executeCommand("claude", args, {
          cwd: repoDir, // Execute directly inside the repo directory
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'claude' CLI was not found. Install it with: npm install -g @anthropic-ai/claude-code",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `Claude Code execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
      }

      // Parse results
      const cliOutput = this.parseCliOutput(result.stdout);

      // Clean up
      await this.cleanup(workDir);

      return {
        success: true,
        commitHash: this.getCliString(cliOutput, "commitHash", "commit"),
        pullRequestUrl: this.getCliString(
          cliOutput,
          "pullRequestUrl",
          "pr_url",
        ),
        testResults: Array.isArray(cliOutput.testResults)
          ? cliOutput.testResults
          : undefined,
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
