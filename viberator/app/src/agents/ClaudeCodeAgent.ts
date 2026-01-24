import type { AgentCLIResult } from "./BaseAgent";
import { BaseAgent } from "./BaseAgent";
import { AgentConfig, ExecutionContext } from "../types";
import { Logger } from "winston";
import * as path from "path";

export class ClaudeCodeAgent extends BaseAgent {
  constructor(config: AgentConfig, logger: Logger) {
    super(config, logger);
  }

  protected requiresApiKey(): boolean {
    return true;
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
        "--include-partial-messages",
        "--output-format=stream-json",
        "--verbose",
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
        };

        // Pass custom base URL if configured
        if (this.config.endpoint) {
          env.ANTHROPIC_BASE_URL = this.config.endpoint;
        }

        result = await this.executeCommand("claude", args, {
          cwd: repoDir, // Execute directly inside the repo directory
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError: any) {
        if (cmdError.code === "ENOENT") {
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

      // Get changed files
      const changedFiles = await this.getChangedFiles(repoDir);

      // Parse results
      let cliOutput: any = {};
      try {
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cliOutput = JSON.parse(jsonMatch[0]);
        } else {
          cliOutput = JSON.parse(result.stdout);
        }
      } catch {
        this.logger.warn("Could not parse execution output as JSON");
      }

      // Clean up
      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: cliOutput.commitHash || cliOutput.commit,
        pullRequestUrl: cliOutput.pullRequestUrl || cliOutput.pr_url,
        testResults: cliOutput.testResults,
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }

  private formatStreamJson(stdout: string): string {
    const lines = stdout.split("\n").filter((line) => line.trim());
    let output = "";
    let currentToolUse: string | null = null;

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        // Handle text deltas (Assistant talking)
        if (data.type === "stream_event" && data.event?.delta?.text) {
          output += data.event.delta.text;
        }

        // Handle Tool Use starts
        if (
          data.type === "stream_event" &&
          data.event?.content_block?.type === "tool_use"
        ) {
          currentToolUse = data.event.content_block.name;
          output += `\n[Tool Use: ${currentToolUse}]\n`;
        }

        // Handle Tool Input deltas (the JSON being built for the tool)
        if (
          data.type === "stream_event" &&
          data.event?.delta?.type === "input_json_delta"
        ) {
          // You can optionally print the JSON delta here,
          // but often it's too noisy for "pretty" output
        }

        // Handle Tool Results (User response to assistant)
        if (
          data.type === "user" &&
          data.message?.content?.[0]?.type === "tool_result"
        ) {
          const result = data.message.content[0].content;
          output += `\n[Tool Result]:\n${result}\n`;
        }
      } catch (e) {
        // If it's not JSON, it might be raw output, append as is
        output += line + "\n";
      }
    }
    return output.trim();
  }

  private extractCommitHash(text: string): string | undefined {
    const match =
      text.match(/commit ([a-f0-9]{40})/i) ||
      text.match(/committed as ([a-f0-9]{7,40})/i);
    return match ? match[1] : undefined;
  }
}
