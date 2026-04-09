import { BaseAgent } from "./BaseAgent";
import type { AgentCLIResult } from "./BaseAgent";
import { ExecutionContext } from "../types";
import * as fs from "fs";
import * as path from "path";

/**
 * Pi coding agent harness.
 *
 * One-shot execution: runs `pi --print` via executeAgentCLI.
 * Interactive sessions: ACP bridge via `pi-acp` (spawns `pi --mode rpc`).
 *
 * Install: npm install -g @mariozechner/pi-coding-agent pi-acp
 */
export class PiCodingAgent extends BaseAgent {
  /**
   * Pi resolves API credentials from its config directory (PI_CODING_AGENT_DIR)
   * rather than requiring them in the viberator agent config.
   */
  protected requiresApiKey(): boolean {
    return false;
  }

  /**
   * ACP server command — pi-acp bridges ACP JSON-RPC 2.0 over stdio
   * and internally spawns `pi --mode rpc`.
   * Source: https://github.com/svkozak/pi-acp
   */
  public getAcpServerCommand(): string[] {
    return ["pi-acp"];
  }

  /**
   * Environment variables for pi-acp.  Injects the API key when explicitly
   * provided, and sets PI_CODING_AGENT_DIR when the per-job harness config
   * sub-directory exists (populated from "pi/models.json" instruction files).
   */
  public override getAcpEnvironment(harnessConfigDir: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    if (this.config.apiKey) {
      env.ANTHROPIC_API_KEY = this.config.apiKey;
    }
    const piDir = path.join(harnessConfigDir, "pi");
    if (fs.existsSync(piDir)) {
      env.PI_CODING_AGENT_DIR = piDir;
    }
    return env;
  }

  /**
   * Builds the environment variables needed to run the pi CLI in one-shot mode.
   *
   * PI_CODING_AGENT_DIR points to the pre-configured harness directory inside
   * the job workspace (.harness-config/pi/), which contains models.json
   * specifying the active model and API key env-var reference.
   */
  public getPiEnvironment(repoDir: string): NodeJS.ProcessEnv {
    const workDir = path.dirname(repoDir);
    const piConfigDir = path.join(workDir, ".harness-config", "pi");
    const env: NodeJS.ProcessEnv = {
      PI_CODING_AGENT_DIR: piConfigDir,
    };
    if (this.config.apiKey) {
      env.ANTHROPIC_API_KEY = this.config.apiKey;
    }
    if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    return env;
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    try {
      await this.cloneRepository(context.repoUrl, context.branch, workDir);
      const repoDir = path.join(workDir, "repo");

      this.logger.info("Executing pi coding agent (one-shot)", { repoDir });

      const args = [
        "--print", prompt,
        "--output-format", "json",
        "--cwd", repoDir,
      ];

      let result;
      try {
        result = await this.executeCommand("pi", args, {
          cwd: repoDir,
          env: this.getPiEnvironment(repoDir),
          timeout: this.config.executionTimeLimit * 1000,
        });
      } catch (cmdError) {
        if (this.isCommandNotFoundError(cmdError)) {
          throw new Error(
            "The 'pi' CLI was not found. Install it with: npm install -g @mariozechner/pi-coding-agent",
          );
        }
        throw cmdError;
      }

      if (result.exitCode !== 0) {
        throw new Error(
          `Pi agent execution failed (Exit ${result.exitCode}): ${result.stderr || result.stdout}`,
        );
      }

      const changedFiles = await this.gitService.getChangedFiles(repoDir);
      await this.cleanup(workDir);

      return { success: true, changedFiles };
    } catch (error) {
      await this.cleanup(workDir);
      throw error;
    }
  }
}
