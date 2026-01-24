import { AgentConfig, ExecutionContext, ExecutionResult } from "../types";
import { Logger } from "winston";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { GitService } from "../services/GitService";

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
    this.gitService = new GitService(logger);
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
      this.logger.info("Repository already exists, skipping clone", {
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
        env: {
          ...process.env,
          ...options.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let stdoutBuffer = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        stdoutBuffer += chunk;

        const lines = stdoutBuffer.split("\n");
        // Keep the last partial line in the buffer
        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            this.formatAndPrintStreamEvent(parsed);
          } catch (e) {
            // Not JSON or incomplete, just print raw
            process.stdout.write(line + "\n");
          }
        }
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Usually stderr isn't JSON-streamed, but you can apply similar logic if needed
        process.stderr.write(chunk);
      });

      const timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      child.on("close", (code) => {
        clearTimeout(timeoutId);
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
   * Format and print stream event data to stdout
   * @param data
   * @private
   */
  private formatAndPrintStreamEvent(data: any): void {
    // 1. Assistant Text deltas
    if (data.type === "stream_event" && data.event?.delta?.text) {
      process.stdout.write(data.event.delta.text);
      return;
    }

    // 2. Tool Use starts (e.g., Grep, Edit)
    if (
      data.type === "stream_event" &&
      data.event?.content_block?.type === "tool_use"
    ) {
      process.stdout.write(
        `\n\x1b[34m[Agent Tool: ${data.event.content_block.name}]\x1b[0m `,
      );
      return;
    }

    // 3. Tool Input deltas (the JSON arguments being typed out)
    if (data.type === "stream_event" && data.event?.delta?.partial_json) {
      // Optional: print tool arguments in gray
      // process.stdout.write(`\x1b[90m${data.event.delta.partial_json}\x1b[0m`);
      return;
    }

    // 4. Tool Results (the outcome of the command)
    if (
      data.type === "user" &&
      data.message?.content?.[0]?.type === "tool_result"
    ) {
      const result = data.message.content[0].content;
      process.stdout.write(`\n\x1b[32m[Result]:\x1b[0m\n${result}\n`);
      return;
    }

    // 5. Final message stop / summaries
    if (data.type === "stream_event" && data.event?.type === "message_stop") {
      process.stdout.write("\n");
      return;
    }
  }
  // ... existing code ...

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

  /**
   * Parse changed files from git diff
   */
  protected async getChangedFiles(repoDir: string): Promise<string[]> {
    return this.gitService.getChangedFiles(repoDir);
  }

  /**
   * Create a new branch
   */
  protected async createBranch(
    repoDir: string,
    branchName: string,
  ): Promise<void> {
    return this.gitService.createBranch(repoDir, branchName);
  }

  /**
   * Commit changes
   */
  protected async commitChanges(
    repoDir: string,
    message: string,
  ): Promise<string> {
    return this.gitService.commitChanges(repoDir, message);
  }

  /**
   * Push branch
   */
  protected async pushBranch(
    repoDir: string,
    branchName: string,
  ): Promise<void> {
    return this.gitService.pushBranch(repoDir, branchName);
  }

  /**
   * Create a pull request
   */
  protected async createPullRequest(
    repoDir: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
  ): Promise<string> {
    return this.gitService.createPullRequest(
      repoDir,
      sourceBranch,
      targetBranch,
      title,
    );
  }
}
