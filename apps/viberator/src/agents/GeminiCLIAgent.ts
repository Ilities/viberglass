import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class GeminiCLIAgent extends BaseAgent {
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
        "code",
        "--api-key",
        this.config.apiKey!,
        "--input",
        promptFile,
        "--workspace",
        repoDir,
        "--max-output-tokens",
        (this.config.maxTokens || 3500).toString(),
        "--temperature",
        (this.config.temperature || 0.15).toString(),
      ];

      if (this.config.endpoint) {
        args.push("--endpoint", this.config.endpoint);
      }

      if (context.testRequired) {
        args.push("--run-tests");
      }

      const cliBinary = "gemini";
      this.logger.info(`Executing ${cliBinary}`, {
        args: args.filter((arg) => arg !== this.config.apiKey),
      });

      const result = await this.executeCommand(cliBinary, args, {
        cwd: workDir,
        timeout: this.config.executionTimeLimit * 1000,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Gemini CLI failed: ${result.stderr}`);
      }

      const changedFiles = await this.getChangedFiles(repoDir);

      // Read PR description from file (before cleanup)
      const pullRequestDescription = await this.readPRDescription(repoDir);

      const cliOutput = this.parseCliOutput(result.stdout);

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: this.getCliString(cliOutput, "commitHash", "commit"),
        pullRequestUrl: this.getCliString(cliOutput, "pullRequestUrl", "pr_url"),
        pullRequestDescription,
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
