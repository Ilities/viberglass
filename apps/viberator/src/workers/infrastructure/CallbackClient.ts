import { Logger } from "winston";
import { TurnCallbackClient } from "./TurnCallbackClient";
import type { ExecutionManifest } from "@viberglass/telemetry";
import type { SkillFile } from "@viberglass/types";
import {
  FetchRetryConfig,
  fetchWithRetry,
  getJson,
  redactSensitiveInfo,
  isInternalLogMessage,
} from "./callbackFetch";

export interface CallbackResult {
  success: boolean;
  commitHash?: string;
  pullRequestUrl?: string;
  /** The documents a task turn wrote. */
  documents?: Partial<Record<"plan" | "summary", string>>;
  codeDiscarded?: boolean;
  /** Whether the turn continued the harness's session (AcpSessionStart). */
  sessionStart?: { resumed: boolean };
  contextUsage?: { used: number; size: number | null };
  compacted?: boolean;
  errorMessage?: string;
  /** Why the run failed (JOB_FAILURE_CODE), decided by the stage that failed. */
  failureCode?: string;
  logs: string[];
  changedFiles: string[];
  executionTime: number;
  branch?: string;
  /**
   * Execution half of the run manifest.
   *
   * Only the worker knows the model, token usage, base SHA and harness
   * version; the backend persists what arrives here into
   * `job_run_manifests`. Optional so an older worker talking to a newer
   * backend still reports results normally.
   */
  runManifest?: ExecutionManifest;
}

/** What a worker reports to the platform about its run; a task turn's own callbacks are on `turn`. */
export class CallbackClient {
  readonly turn: TurnCallbackClient;
  private apiUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private callbackToken?: string;

  constructor(
    private logger: Logger,
    config: {
      platformUrl?: string;
      maxRetries?: number;
      retryDelay?: number;
      callbackToken?: string;
    } = {},
  ) {
    this.apiUrl =
      config.platformUrl ||
      process.env.PLATFORM_API_URL ||
      "http://localhost:8888";
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.callbackToken = config.callbackToken;
    this.turn = new TurnCallbackClient(logger, {
      apiUrl: this.apiUrl,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      callbackToken: this.callbackToken,
    });
  }

  async sendResult(
    jobId: string,
    tenantId: string,
    result: CallbackResult,
  ): Promise<void> {
    const body = {
      ...result,
      logs: result.logs
        .filter((log) => !isInternalLogMessage(log))
        .map((log) => redactSensitiveInfo(log)),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/result`,
      tenantId,
      body,
      { timeoutMs: 30000, label: "job result" },
      { jobId },
    );
  }

  async sendProgress(
    jobId: string,
    tenantId: string,
    progress: {
      step?: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const body = {
      step: progress.step || null,
      message: redactSensitiveInfo(progress.message),
      details: progress.details || null,
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/progress`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "job progress" },
      { jobId },
    );
  }

  async sendCodexAuthCache(
    jobId: string,
    tenantId: string,
    payload: {
      secretName: string;
      authJson: string;
      updatedAt?: string;
    },
  ): Promise<void> {
    const body = {
      secretName: payload.secretName,
      authJson: payload.authJson,
      updatedAt: payload.updatedAt || new Date().toISOString(),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/codex-auth-cache`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "Codex auth cache" },
      { jobId, secretName: payload.secretName },
    );
  }

  async sendLogBatch(
    jobId: string,
    tenantId: string,
    logs: Array<{
      level: "info" | "warn" | "error" | "debug";
      message: string;
      source?: string;
      internal?: boolean;
    }>,
  ): Promise<void> {
    if (logs.length === 0) return;

    const externalLogs = logs.filter(
      (log) => !log.internal && !isInternalLogMessage(log.message),
    );
    if (externalLogs.length === 0) return;

    const body = {
      logs: externalLogs.map((log) => ({
        level: log.level,
        message: redactSensitiveInfo(log.message),
        source: log.source || null,
      })),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/logs/batch`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "batch job logs" },
      { jobId, count: externalLogs.length },
    );
  }

  /** One of the runner's skills, for the worker to write where the agent's harness reads skills. */
  async fetchSkill(jobId: string, tenantId: string, skillId: string): Promise<SkillFile[]> {
    const body = await getJson(`${this.apiUrl}/api/jobs/${jobId}/skills/${skillId}`, tenantId, 30000, this.callbackToken);
    const data = typeof body === "object" && body !== null && "data" in body ? body.data : null;
    const files = typeof data === "object" && data !== null && "files" in data && Array.isArray(data.files) ? data.files : [];
    return files.filter(
      (file: unknown): file is SkillFile =>
        typeof file === "object" &&
        file !== null &&
        "path" in file &&
        typeof file.path === "string" &&
        "contentBase64" in file &&
        typeof file.contentBase64 === "string",
    );
  }

  private async post(
    url: string,
    tenantId: string,
    body: unknown,
    config: FetchRetryConfig,
    context: Record<string, unknown>,
  ): Promise<void> {
    await fetchWithRetry(url, tenantId, body, config, context, {
      logger: this.logger,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      callbackToken: this.callbackToken,
    });
  }

}

