import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class CodexAgent extends BaseAgent {
  protected requiresApiKey(): boolean {
    const authMode = process.env.CODEX_AUTH_MODE || "api_key";
    return authMode === "api_key";
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

      const changedFiles = await this.getChangedFiles(repoDir);

      // Read PR description from file (before cleanup)
      const pullRequestDescription = await this.readPRDescription(repoDir);

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
        pullRequestDescription,
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
