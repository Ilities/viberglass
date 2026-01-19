import { BaseAgent } from "./BaseAgent";
import { ExecutionContext, ExecutionResult } from "../types";
import * as path from "path";

export class CodexAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    return true;
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<Omit<ExecutionResult, "executionTime" | "cost">> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const promptFile = await this.writePromptToFile(prompt, workDir);

      const args = [
        "fix",
        "--api-key",
        this.config.apiKey!,
        "--prompt",
        promptFile,
        "--directory",
        repoDir,
        "--max-tokens",
        (this.config.maxTokens || 8000).toString(),
        "--temperature",
        (this.config.temperature || 0.0).toString(),
      ];

      if (this.config.endpoint) {
        args.push("--base-url", this.config.endpoint);
      }

      if (context.testRequired) {
        args.push("--run-tests");
      }

      const result = await this.executeCommand("codex", args, {
        cwd: workDir,
        timeout: this.config.executionTimeLimit * 1000,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Codex CLI failed: ${result.stderr}`);
      }

      const changedFiles = await this.getChangedFiles(repoDir);
      let cliOutput: any = {};
      try {
        cliOutput = JSON.parse(result.stdout);
      } catch {
        this.logger.warn("Could not parse Codex CLI output", {
          stdout: result.stdout,
        });
      }

      await this.cleanup(workDir);

      return {
        success: true,
        changedFiles,
        commitHash: cliOutput.commit,
        pullRequestUrl: cliOutput.pr_url,
        testResults: cliOutput.test_results,
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
