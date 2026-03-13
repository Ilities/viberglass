import { AgentConfig, ExecutionContext, ExecutionResult } from "../types";
import { Logger } from "winston";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import GitService from "../services/GitService";
import { normalizeAgentStreamLine } from "./agentStreamNormalizer";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Intermediate type for CLI results that may include optional cost
export type AgentCLIResult = Omit<ExecutionResult, "executionTime" | "cost"> & {
  cost?: number;
};

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected logger: Logger;
  protected gitService: GitService;
  protected ownsWorkDir: boolean = true;

  constructor(config: AgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.gitService = new GitService(logger, {
      userName: process.env.GIT_USER_NAME || "Vibes Viber",
      userEmail: process.env.GIT_USER_EMAIL || "viberator@viberglass.io",
    });
  }

  /**
   * Execute the agent with the given prompt and context
   */
  async execute(
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Starting ${this.config.name} execution`, {
        agent: this.config.name,
        repoUrl: context.repoUrl,
      });

      // Validate configuration
      this.validateConfig();

      // Prepare working directory
      const workDir = await this.prepareWorkingDirectory(context);

      // Execute the specific agent CLI
      const result = await this.executeAgentCLI(prompt, context, workDir);

      const executionTime = Date.now() - startTime;

      return {
        ...result,
        executionTime,
        cost: result.cost ?? this.config.costPerExecution,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`${this.config.name} execution failed`, {
        error: errorMessage,
        stack: errorStack,
        executionTime,
        agent: this.config.name,
        repoUrl: context.repoUrl,
        branch: context.branch,
      });

      return {
        success: false,
        changedFiles: [],
        errorMessage,
        executionTime,
        cost: this.config.costPerExecution,
      };
    }
  }

  /**
   * Validate agent configuration
   */
  protected validateConfig(): void {
    if (!this.config.apiKey && this.requiresApiKey()) {
      throw new Error(`API key is required for ${this.config.name}`);
    }
  }

  /**
   * Check if the agent requires an API key
   */
  protected abstract requiresApiKey(): boolean;

  /**
   * Execute the specific agent CLI
   */
  protected abstract executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult>;

  /**
   * Prepare working directory for execution
   */
  protected async prepareWorkingDirectory(
    context: ExecutionContext,
  ): Promise<string> {
    if (context.repoDir) {
      this.ownsWorkDir = false;
      const workDir = path.dirname(context.repoDir);
      this.logger.debug("Using existing repository directory", {
        repoDir: context.repoDir,
        workDir,
      });
      return workDir;
    }

    this.ownsWorkDir = true;
    const workDir = path.join(
      process.cwd(),
      "workdir",
      `${this.config.name}_${Date.now()}`,
    );

    // Create working directory
    await fs.promises.mkdir(workDir, { recursive: true });

    this.logger.debug("Working directory prepared", { workDir });

    return workDir;
  }

  /**
   * Clone repository with automatic SCM authentication
   */
  protected async cloneRepository(
    repoUrl: string,
    branch: string,
    workDir: string,
  ): Promise<void> {
    // If repo directory already exists (passed in context), skip cloning
    const repoPath = path.join(workDir, "repo");
    if (fs.existsSync(repoPath)) {
      this.logger.debug("Repository already exists, skipping clone", {
        repoPath,
      });
      return;
    }

    return this.gitService.cloneRepository(repoUrl, branch, workDir);
  }

  /**
   * Execute shell command
   */
  protected async executeCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.executionTimeLimit * 1000;

      const child = spawn(command, args, {
        cwd: options.cwd,
        env: this.buildCommandEnvironment(options.env),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let stdoutBuffer = "";
      let stderrBuffer = "";

      const flushBufferedLines = (
        buffer: string,
        onLine: (line: string) => void,
      ): string => {
        const lines = buffer.split(/\r?\n/);
        const remainder = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }
          onLine(line);
        }

        return remainder;
      };

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        stdoutBuffer += chunk;
        stdoutBuffer = flushBufferedLines(stdoutBuffer, (line) => {
          this.emitAgentLogLines(line);
        });
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        stderrBuffer += chunk;
        stderrBuffer = flushBufferedLines(stderrBuffer, (line) => {
          this.logger.warn(`[agent:${this.config.name}:stderr] ${line}`);
        });
      });

      const timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      child.on("close", (code) => {
        clearTimeout(timeoutId);
        const remainingStdout = stdoutBuffer.trim();
        if (remainingStdout.length > 0) {
          this.emitAgentLogLines(remainingStdout);
        }
        const remainingStderr = stderrBuffer.trim();
        if (remainingStderr.length > 0) {
          this.logger.warn(
            `[agent:${this.config.name}:stderr] ${remainingStderr}`,
          );
        }
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      child.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private emitAgentLogLines(line: string): void {
    const normalized = normalizeAgentStreamLine(line);
    for (const normalizedLine of normalized) {
      this.logger.info(`[agent:${this.config.name}:stdout] ${normalizedLine}`);
    }
  }

  protected buildCommandEnvironment(
    overrides?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = {
      ...process.env,
      ...overrides,
    };
    merged.HOME = this.resolveHomeDirectory(merged.HOME);
    return merged;
  }

  private resolveHomeDirectory(candidateHome: string | undefined): string {
    const candidates: string[] = [];

    if (typeof candidateHome === "string" && candidateHome.trim().length > 0) {
      candidates.push(candidateHome.trim());
    }

    const runtimeHome = process.env.HOME?.trim();
    if (runtimeHome) {
      candidates.push(runtimeHome);
    }

    const systemHome = os.homedir().trim();
    if (systemHome.length > 0) {
      candidates.push(systemHome);
    }

    candidates.push("/tmp");

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      fs.mkdirSync("/tmp", { recursive: true });
    } catch {
      // Best effort only; command execution will still proceed.
    }

    return "/tmp";
  }

  /**
   * Write prompt to file
   */
  protected async writePromptToFile(
    prompt: string,
    workDir: string,
  ): Promise<string> {
    const promptFile = path.join(workDir, "prompt.txt");
    await fs.promises.writeFile(promptFile, prompt, "utf8");
    return promptFile;
  }

  /**
   * Read output from file
   */
  protected async readOutputFromFile(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch (error) {
      this.logger.warn("Could not read output file", { filePath, error });
      return "";
    }
  }

  /**
   * Parse structured JSON output returned by agent CLIs.
   * Some CLIs print plain JSON while others include surrounding logs.
   */
  protected parseCliOutput(stdout: string): JsonObject {
    const direct = this.tryParseJsonObject(stdout);
    if (direct) {
      return direct;
    }

    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {};
    }

    return this.tryParseJsonObject(jsonMatch[0]) ?? {};
  }

  protected getCliString(
    cliOutput: JsonObject,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = cliOutput[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }

  protected isCommandNotFoundError(error: unknown): boolean {
    if (!isJsonObject(error)) {
      return false;
    }
    return error.code === "ENOENT";
  }

  private tryParseJsonObject(raw: string): JsonObject | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isJsonObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Clean up working directory
   */
  protected async cleanup(workDir: string): Promise<void> {
    if (!this.ownsWorkDir) {
      this.logger.debug("Skipping cleanup as directory is not owned by agent", {
        workDir,
      });
      return;
    }
    try {
      await fs.promises.rm(workDir, { recursive: true, force: true });
      this.logger.debug("Working directory cleaned up", { workDir });
    } catch (error) {
      this.logger.warn("Failed to cleanup working directory", {
        workDir,
        error,
      });
    }
  }
}
