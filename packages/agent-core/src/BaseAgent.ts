import { Logger } from "winston";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_VG_AGENT_HARNESS_VERSION,
  ATTR_VG_AGENT_SESSION_ID,
  ATTR_VG_CHANGED_FILE_COUNT,
  ATTR_VG_COMMIT_SHA,
  ATTR_VG_COST_PROVENANCE,
  ATTR_VG_COST_USD,
  ATTR_VG_PULL_REQUEST_URL,
  ATTR_VG_USAGE_AVAILABLE,
  COST_PROVENANCE_ACTUAL,
  COST_PROVENANCE_ESTIMATED,
  COST_PROVENANCE_UNAVAILABLE,
  definedAttributes,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  hashPrompt,
  markSpanFailed,
  providerNameForAgent,
  recordSpanError,
  SpanKind,
  withSpan,
  type Span,
} from "@viberglass/telemetry";
import { AgentStreamNormalizer } from "./agentStreamNormalizer";
import { sanitizeAgentEnvironment } from "./agentEnvironment";
import { withWorkingDirectory } from "./workingDirectoryEnvironment";
import type { IAgentGitService } from "./git/IAgentGitService";
import { NoopAgentGitService } from "./git/NoopAgentGitService";
import type { BaseAgentConfig, ExecutionContext, ExecutionResult, AgentCLIResult } from "./types";
import type { AgentUsageReport } from "./usage";

export type { AgentCLIResult };

export abstract class BaseAgent<C extends BaseAgentConfig = BaseAgentConfig> {
  protected config: C;
  protected logger: Logger;
  protected gitService: IAgentGitService;
  protected ownsWorkDir: boolean = true;

  constructor(config: C, logger: Logger, gitService?: IAgentGitService) {
    this.config = config;
    this.logger = logger;
    this.gitService = gitService ?? new NoopAgentGitService();
  }

  /**
   * Runs the agent CLI inside the GenAI `invoke_agent` span.
   *
   * This is the layer that actually knows the model and the token usage, so
   * the GenAI attributes live here rather than on the orchestration span
   * above it — one `gen_ai.operation.name` span per agent invocation, so
   * per-operation aggregates don't double-count.
   *
   * Note this covers the one-shot CLI path only. Interactive ACP turns run
   * through `AcpExecutor` and do not pass through here; instrumenting those
   * is separate
   */
  async execute(
    prompt: string,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    return withSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT} ${this.config.name}`,
      {
        kind: SpanKind.CLIENT,
        attributes: definedAttributes({
          [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
          [ATTR_GEN_AI_AGENT_NAME]: this.config.name,
          [ATTR_GEN_AI_PROVIDER_NAME]: providerNameForAgent(this.config.name),
          // The configured model is a request-time intent; the CLI may
          // override it, which is why the response model is recorded too.
          [ATTR_GEN_AI_REQUEST_MODEL]:
            typeof this.config.model === "string" ? this.config.model : undefined,
          [ATTR_GEN_AI_CONVERSATION_ID]: context.acpSessionId,
          [ATTR_VG_AGENT_SESSION_ID]: context.agentSessionId,
          // Length, not content: prompts embed ticket bodies from untrusted
          // webhook senders. Content capture is opt-in and handled elsewhere.
          "vg.prompt.characters": prompt.length,
        }),
      },
      (span) => this.runAgent(prompt, context, span),
    );
  }

  private async runAgent(
    prompt: string,
    context: ExecutionContext,
    span: Span,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Starting ${this.config.name} execution`, {
        agent: this.config.name,
        repoUrl: context.repoUrl,
      });

      this.validateConfig();

      const workDir = await this.prepareWorkingDirectory(context);

      const result = await this.executeAgentCLI(prompt, context, workDir);

      const changedFiles =
        result.changedFiles ??
        (await this.gitService.getChangedFiles(path.join(workDir, "repo")));

      const executionTime = Date.now() - startTime;

      this.recordUsageOnSpan(span, result.usage, result.cost);
      span.setAttributes(
        definedAttributes({
          [ATTR_VG_CHANGED_FILE_COUNT]: changedFiles.length,
          [ATTR_VG_COMMIT_SHA]: result.commitHash,
          [ATTR_VG_PULL_REQUEST_URL]: result.pullRequestUrl,
        }),
      );

      // A CLI can exit 0 and still report failure in its output.
      if (!result.success) {
        markSpanFailed(span, result.errorMessage ?? "agent reported failure");
      }

      return {
        ...result,
        changedFiles,
        executionTime,
        cost: result.cost ?? this.config.costPerExecution,
        promptHash: hashPrompt(prompt),
        promptCharacters: prompt.length,
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

      // Failures are returned as data, not rethrown — callers depend on that —
      // so the span has to be failed explicitly here.
      recordSpanError(span, error);
      this.recordUsageOnSpan(span, undefined, undefined);

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
   * Writes token usage and cost onto the span.
   *
   * The `vg.usage.available` and `vg.cost.provenance` attributes are the point
   * of this method: PLAN.md Phase 0 requires that a CLI which reports no usage
   * is recorded as reporting none, rather than silently backfilled from the
   * plugin's `costPerExecution` constant and later mistaken for a measurement.
   */
  private recordUsageOnSpan(
    span: Span,
    usage: AgentUsageReport | undefined,
    fallbackCost: number | undefined,
  ): void {
    span.setAttribute(ATTR_VG_USAGE_AVAILABLE, Boolean(usage));

    if (usage) {
      span.setAttributes(
        definedAttributes({
          [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage.inputTokens,
          [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage.outputTokens,
          [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: usage.reasoningOutputTokens,
          [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: usage.cacheReadInputTokens,
          [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]:
            usage.cacheCreationInputTokens,
          [ATTR_GEN_AI_RESPONSE_MODEL]: usage.model,
          [ATTR_VG_AGENT_HARNESS_VERSION]: usage.harnessVersion,
          "vg.agent.turns": usage.turns,
        }),
      );
      if (usage.stopReason) {
        span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [usage.stopReason]);
      }
    }

    const reportedCost = usage?.costUsd;
    if (reportedCost !== undefined) {
      span.setAttribute(ATTR_VG_COST_USD, reportedCost);
      span.setAttribute(ATTR_VG_COST_PROVENANCE, COST_PROVENANCE_ACTUAL);
      return;
    }

    const configuredCost = fallbackCost ?? this.config.costPerExecution;
    if (typeof configuredCost === "number" && Number.isFinite(configuredCost)) {
      // A per-plugin constant, not a measurement. Labelled so nothing
      // downstream mistakes it for one.
      span.setAttribute(ATTR_VG_COST_USD, configuredCost);
      span.setAttribute(ATTR_VG_COST_PROVENANCE, COST_PROVENANCE_ESTIMATED);
    } else {
      span.setAttribute(ATTR_VG_COST_PROVENANCE, COST_PROVENANCE_UNAVAILABLE);
    }
  }

  protected validateConfig(): void {
    if (!this.config.apiKey && this.requiresApiKey()) {
      throw new Error(`API key is required for ${this.config.name}`);
    }
  }

  protected abstract requiresApiKey(): boolean;

  protected abstract executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult>;

  public abstract getAcpServerCommand(): string[];

  public getAcpEnvironment(_harnessConfigDir: string): NodeJS.ProcessEnv {
    return {};
  }

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

    await fs.promises.mkdir(workDir, { recursive: true });

    this.logger.debug("Working directory prepared", { workDir });

    return workDir;
  }

  protected async cloneRepository(
    repoUrl: string,
    branch: string,
    workDir: string,
  ): Promise<void> {
    const repoPath = path.join(workDir, "repo");
    if (fs.existsSync(repoPath)) {
      this.logger.debug("Repository already exists, skipping clone", {
        repoPath,
      });
      return;
    }

    return this.gitService.cloneRepository(repoUrl, branch, workDir);
  }

  protected async executeCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || this.config.executionTimeLimit * 1000;
      const normalizer = new AgentStreamNormalizer();

      const child = spawn(command, args, {
        cwd: options.cwd,
        env: withWorkingDirectory(
          this.buildCommandEnvironment(options.env),
          options.cwd,
        ),
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

      const emitLine = (line: string): void => {
        for (const normalized of normalizer.processLine(line)) {
          this.logger.info(`[agent:${this.config.name}:stdout] ${normalized}`);
        }
      };

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        stdoutBuffer += chunk;
        stdoutBuffer = flushBufferedLines(stdoutBuffer, emitLine);
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
          emitLine(remainingStdout);
        }
        for (const normalized of normalizer.flush()) {
          this.logger.info(`[agent:${this.config.name}:stdout] ${normalized}`);
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

  /**
   * Build the environment for a spawned agent CLI.
   *
   * The merged environment is filtered through {@link sanitizeAgentEnvironment} —
   * deny-by-default — so that neither the worker's own inherited `process.env` nor an
   * agent plugin that spreads it into `overrides` can hand the CLI the SCM token or
   * any other platform credential.
   */
  protected buildCommandEnvironment(
    overrides?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const { env, removed } = sanitizeAgentEnvironment({
      ...process.env,
      ...overrides,
    });

    if (removed.length > 0) {
      this.logger.debug("Withheld environment variables from agent CLI", {
        agent: this.config.name,
        count: removed.length,
        names: removed,
      });
    }

    env.HOME = this.resolveHomeDirectory(env.HOME);
    return env;
  }

  public resolveHomeDirectory(candidateHome?: string): string {
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
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
          try {
            const testFile = path.join(candidate, `.write-test-${Date.now()}`);
            fs.writeFileSync(testFile, "test");
            fs.unlinkSync(testFile);
            this.logger.info("Selected writable HOME directory", { candidate });
            return candidate;
          } catch (err) {
            this.logger.warn("HOME candidate not writable in Lambda", {
              candidate,
              error: err instanceof Error ? err.message : String(err),
            });
            continue;
          }
        }
        this.logger.debug("Selected HOME directory", { candidate });
        return candidate;
      }
    }

    this.logger.warn("No suitable HOME directory found; falling back to /tmp", {
      candidates,
    });
    try {
      fs.mkdirSync("/tmp", { recursive: true });
    } catch (err) {
      this.logger.error("Failed to create /tmp fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return "/tmp";
  }

  protected async writePromptToFile(
    prompt: string,
    workDir: string,
  ): Promise<string> {
    const promptFile = path.join(workDir, "prompt.txt");
    await fs.promises.writeFile(promptFile, prompt, "utf8");
    return promptFile;
  }

  protected async readOutputFromFile(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, "utf8");
    } catch (error) {
      this.logger.warn("Could not read output file", { filePath, error });
      return "";
    }
  }

  protected parseCliOutput(stdout: string): Record<string, unknown> {
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
    cliOutput: Record<string, unknown>,
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
    if (typeof error !== "object" || error === null || Array.isArray(error)) {
      return false;
    }
    return (error as Record<string, unknown>).code === "ENOENT";
  }

  private tryParseJsonObject(raw: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

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
