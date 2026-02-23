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
      const effectivePrompt = this.buildPrompt(prompt, context);

      const args = [
        "--prompt",
        effectivePrompt,
        "--output",
        "json",
        "--workdir",
        repoDir,
      ];

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        MISTRAL_API_KEY: this.config.apiKey!,
      };

      const result = await this.executeVibeBinary(args, env, workDir);

      if (result.exitCode !== 0) {
        throw new Error(
          `Mistral Vibe execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
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

  private buildPrompt(prompt: string, context: ExecutionContext): string {
    const promptSections: string[] = [prompt];

    if (context.maxChanges) {
      promptSections.push(`Limit changes to ${context.maxChanges} files.`);
    }

    if (context.testRequired) {
      promptSections.push(
        "Before finishing, run relevant tests and fix any failures.",
      );
    }

    return promptSections.join("\n\n");
  }

  private async executeVibeBinary(
    args: string[],
    env: NodeJS.ProcessEnv,
    workDir: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      return await this.executeCommand("vibe", args, {
        cwd: workDir,
        env,
        timeout: this.config.executionTimeLimit * 1000,
      });
    } catch (cmdError) {
      if (!this.isCommandNotFoundError(cmdError)) {
        throw cmdError;
      }
    }

    try {
      this.logger.warn(
        "The 'vibe' binary was not found. Falling back to 'mistral-vibe'.",
      );
      return await this.executeCommand("mistral-vibe", args, {
        cwd: workDir,
        env,
        timeout: this.config.executionTimeLimit * 1000,
      });
    } catch (cmdError) {
      if (this.isCommandNotFoundError(cmdError)) {
        throw new Error(
          "The Mistral Vibe CLI was not found. Install it with: pip install mistral-vibe",
        );
      }
      throw cmdError;
    }
  }
}
