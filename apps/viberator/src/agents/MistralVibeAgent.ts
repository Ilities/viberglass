import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class MistralVibeAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    return true;
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const promptFile = await this.writePromptToFile(prompt, workDir);

      const args = [
        "vibe",
        "--api-key",
        this.config.apiKey!,
        "--prompt-file",
        promptFile,
        "--repo",
        repoDir,
        "--max-tokens",
        (this.config.maxTokens || 4000).toString(),
        "--temperature",
        (this.config.temperature || 0.1).toString(),
      ];

      if (this.config.endpoint) {
        args.push("--endpoint", this.config.endpoint);
      }

      if (context.testRequired) {
        args.push("--with-tests");
      }

      // Try both 'mistral-vibe' and 'vibe' as binary names
      const cliBinary = "mistral-vibe";
      this.logger.info(`Executing ${cliBinary}`, {
        args: args.filter((arg) => arg !== this.config.apiKey),
      });

      let result;
      try {
        result = await this.executeCommand(cliBinary, args, {
          cwd: workDir,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to execute ${cliBinary}, trying 'vibe' instead`,
        );
        result = await this.executeCommand("vibe", args, {
          cwd: workDir,
          timeout: this.config.executionTimeLimit * 1000,
        });
      }

      if (result.exitCode !== 0) {
        throw new Error(`Mistral Vibe execution failed: ${result.stderr}`);
      }

      const changedFiles = await this.getChangedFiles(repoDir);

      const cliOutput = this.parseCliOutput(result.stdout);

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: this.getCliString(cliOutput, "commitHash", "commit"),
        pullRequestUrl: this.getCliString(cliOutput, "pullRequestUrl", "pr_url"),
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
