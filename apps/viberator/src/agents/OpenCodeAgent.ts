import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class OpenCodeAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    // OpenCode can resolve provider credentials from several env keys.
    return false;
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
        effectivePrompt += "\n\nRun tests to verify your changes before finishing.";
      }

      const args = [
        "run",
        "--format",
        "json",
      ];

      if (this.config.model) {
        args.push("--model", this.config.model as string);
      }

      args.push(effectivePrompt);

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.config.apiKey) {
        env.OPENCODE_API_KEY = this.config.apiKey;
        env.OPENAI_API_KEY = env.OPENAI_API_KEY || this.config.apiKey;
      }
      if (this.config.endpoint) {
        env.OPENCODE_BASE_URL = this.config.endpoint;
        env.OPENAI_BASE_URL = env.OPENAI_BASE_URL || this.config.endpoint;
      }

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

      const changedFiles = await this.getChangedFiles(repoDir);
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
