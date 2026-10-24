import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type { AgentCLIResult, ExecutionContext, IAgentGitService } from "@viberglass/agent-core";
import type { Logger } from "winston";
import type { DeepseekHarnessConfig } from "./config";

/**
 * DeepSeek Harness harness. Task turns talk to it over ACP: the worker starts
 * `getAcpServerCommand()` with `getAcpEnvironment()`. A job without a session,
 * such as a scheduled one, runs the CLI once through `executeAgentCLI`.
 */
export class DeepseekHarnessAgent extends BaseAgent<DeepseekHarnessConfig> {
  constructor(config: DeepseekHarnessConfig, logger: Logger, gitService?: IAgentGitService) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /** The command that starts the harness's ACP server on stdio. */
  public getAcpServerCommand(): string[] {
    return ["dsh-acp"];
  }

  public override getAcpEnvironment(harnessConfigDir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { DSH_PERMISSION_MODE: "workspace-write" };
    if (this.config.apiKey) env.DEEPSEEK_API_KEY = this.config.apiKey;
    else if (process.env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (this.config.endpoint) env.DEEPSEEK_BASE_URL = this.config.endpoint;
    else if (process.env.DEEPSEEK_BASE_URL) env.DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
    if (this.config.model) env.DSH_MODEL = this.config.model;
    if (harnessConfigDir) {
      const settingsDir = path.join(harnessConfigDir, "deepseek-harness");
      env.DSH_HOME = settingsDir;
      env.DSH_SESSION_ROOT = path.join(settingsDir, "sessions");
    }
    return env;
  }

  protected async executeAgentCLI(prompt: string, context: ExecutionContext, workDir: string): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");
      const promptSections = [prompt];
      if (context.maxChanges) promptSections.push(`Limit changes to ${context.maxChanges} files.`);
      if (context.testRequired) promptSections.push("Before finishing, run relevant tests and fix any failures.");
      const env = this.getRunEnvironment(workDir);
      let result: { stdout: string; stderr: string; exitCode: number };
      try {
        result = await this.executeCommand("dsh", this.headlessArguments(promptSections.join("\n\n")), {
          cwd: repoDir,
          env,
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (error) {
        if (this.isCommandNotFoundError(error)) {
          throw new Error("The 'dsh' CLI was not found. Install it with: npm install -g @deepseek-ai/dsh");
        }
        throw error;
      }
      if (result.exitCode !== 0) {
        throw new Error(`DeepSeek Harness execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`);
      }
      await this.cleanup(workDir);
      return { success: true };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }

  public headlessArguments(prompt: string): string[] {
    return ["--profile", "headless", prompt];
  }

  public getRunEnvironment(workDir: string): NodeJS.ProcessEnv {
    const env = { ...process.env, ...this.getAcpEnvironment("") };
    env.HOME = this.resolveHomeDirectory(env.HOME);
    env.DSH_HOME = path.join(workDir, ".dsh");
    env.DSH_SESSION_ROOT = path.join(workDir, ".dsh-acp", "sessions");
    return env;
  }
}
