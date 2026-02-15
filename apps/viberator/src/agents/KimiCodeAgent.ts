import { BaseAgent } from "./BaseAgent";
import { ExecutionContext } from "../types";
import type { AgentCLIResult } from "./BaseAgent";
import * as path from "path";

export class KimiCodeAgent extends BaseAgent {
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

      const args = ["--print", prompt, "--yolo"];
      if (this.config.model) {
        args.push("--model", this.config.model as string);
      }

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (this.config.apiKey) {
        // KIMI_API_KEY is the standard for the kimi CLI.
        env.KIMI_API_KEY = this.config.apiKey;
      }
      if (this.config.endpoint) {
        env.KIMI_CODE_ENDPOINT = this.config.endpoint;
      }

      let result;
      try {
        result = await this.executeCommand("kimi", args, {
          cwd: repoDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'kimi' CLI was not found. Install it with: curl -fsSL https://cli.moonshot.ai/kimi.sh | bash",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `Kimi Code execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
      }

      const changedFiles = await this.getChangedFiles(repoDir);
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
      };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
