import { createHash } from "node:crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { Logger } from "winston";
import { decodeStoredLogin, sanitizeAgentEnvironment, type AgentLoginUploader } from "@viberglass/agent-core";
import { DEVICE_CODE_PROGRESS } from "@viberglass/types";
import type { CodexAuthSettings } from "./codexAuthSettings";

interface DeviceAuthState {
  verificationUri?: string;
  userCode?: string;
}

const ANSI_ESCAPE_SEQUENCE_PATTERN =
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/g;
const VERIFICATION_URI_PATTERN = /https?:\/\/[^\s)]+/i;
const LABELED_DEVICE_CODE_PATTERN =
  /(?:device code|one-time code|verification code|enter code|use code)\s*[:=-]?\s*([A-Z0-9-]{4,})/i;
const HYPHENATED_DEVICE_CODE_PATTERN = /\b([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+)\b/;

type ProgressReporter = (
  step: string,
  message: string,
  details?: Record<string, unknown>,
) => Promise<void>;

export function sanitizeCliOutputLine(rawLine: string): string {
  return rawLine
    .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, "")
    .replace(CONTROL_CHARACTER_PATTERN, "")
    .trim();
}

function normalizeVerificationUri(value: string): string | null {
  const normalized = value.trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(normalized) ? normalized : null;
}

function isLikelyDeviceCode(value: string): boolean {
  return (
    /^[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+$/.test(value) ||
    /^(?=.*\d)[A-Z0-9]{8,}$/.test(value)
  );
}

export function parseDeviceAuthValues(rawLine: string): DeviceAuthState {
  const line = sanitizeCliOutputLine(rawLine);
  if (!line) {
    return {};
  }

  const result: DeviceAuthState = {};
  const uriMatch = line.match(VERIFICATION_URI_PATTERN);
  if (uriMatch) {
    const normalizedUri = normalizeVerificationUri(uriMatch[0]);
    if (normalizedUri) {
      result.verificationUri = normalizedUri;
    }
  }

  const labeledCodeMatch = line.match(LABELED_DEVICE_CODE_PATTERN);
  const fallbackCodeMatch = line.match(HYPHENATED_DEVICE_CODE_PATTERN);
  const codeCandidate = labeledCodeMatch?.[1] || fallbackCodeMatch?.[1];
  if (!codeCandidate) {
    return result;
  }

  const normalizedCode = codeCandidate.trim().toUpperCase();
  if (isLikelyDeviceCode(normalizedCode)) {
    result.userCode = normalizedCode;
  }

  return result;
}

export function compactJsonForStorage(jsonContent: string): string {
  const trimmed = jsonContent.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch {
    return trimmed;
  }
}

export function normalizeCodexHomeEnv(env: NodeJS.ProcessEnv): void {
  const codexHome = env.CODEX_HOME?.trim();
  if (codexHome) {
    return;
  }

  const legacyConfigDir = env.CODEX_CONFIG_DIR?.trim();
  if (legacyConfigDir) {
    env.CODEX_HOME = legacyConfigDir;
  }
}

function hashAuthJson(authJson: string): string {
  return createHash("sha256").update(compactJsonForStorage(authJson)).digest("hex");
}

export class CodexAuthManager {
  /** The login the platform holds, as last loaded or uploaded; a different file on disk means Codex refreshed it. */
  private syncedAuthHash: string | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly loginUploader: AgentLoginUploader,
    private readonly workDir: string,
    private readonly sendProgress: ProgressReporter,
    private readonly settings: CodexAuthSettings,
  ) {}

  async materializeAuthCacheFromEnv(): Promise<void> {
    const storedValue = process.env[this.settings.credentialEnvVar];
    const secretValue = storedValue ? decodeStoredLogin(storedValue) : storedValue;
    if (!secretValue || secretValue.trim().length === 0) {
      this.logger.info("No Codex auth cache value found in environment", {
        credentialEnvVar: this.settings.credentialEnvVar,
      });
      return;
    }

    const authPath = this.getPrimaryAuthFilePath();
    const authDir = path.dirname(authPath);

    this.logger.info("Materializing Codex auth cache from environment", {
      authPath,
      credentialEnvVar: this.settings.credentialEnvVar,
      authBytes: Buffer.byteLength(secretValue, "utf-8"),
    });

    await fs.promises.mkdir(authDir, { recursive: true });
    await fs.promises.writeFile(authPath, secretValue, {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.promises.chmod(authPath, 0o600);
    this.syncedAuthHash = hashAuthJson(secretValue);

    this.logger.info("Materialized Codex auth cache from credential", {
      authPath,
      credentialEnvVar: this.settings.credentialEnvVar,
      authBytes: Buffer.byteLength(secretValue, "utf-8"),
    });
  }

  async ensureDeviceAuth(jobId: string, tenantId: string): Promise<void> {
    this.logger.info("Ensuring Codex auth is available for job", {
      jobId,
      tenantId,
      credentialEnvVar: this.settings.credentialEnvVar,
    });

    await this.materializeAuthCacheFromEnv();

    if (await this.hasValidAuthCache()) {
      this.logger.info("Using existing Codex auth cache after env materialization", {
        jobId,
        tenantId,
      });
      return;
    }

    this.logger.info("No stored Codex login, starting interactive Codex device login", {
      jobId,
      tenantId,
    });
    await this.runDeviceAuthLogin(jobId, tenantId);
  }

  async forceFreshDeviceAuth(jobId: string, tenantId: string): Promise<void> {
    this.logger.warn("Forcing fresh Codex device auth after token failure", {
      jobId,
      tenantId,
      credentialEnvVar: this.settings.credentialEnvVar,
    });

    await this.clearLocalAuthCacheFiles(jobId, tenantId);
    await this.runDeviceAuthLogin(jobId, tenantId);
  }

  private getPrimaryAuthFilePath(): string {
    normalizeCodexHomeEnv(process.env);
    const configDir =
      process.env.CODEX_HOME ||
      process.env.CODEX_CONFIG_DIR ||
      path.join(os.homedir(), ".codex");
    return path.join(configDir, "auth.json");
  }

  private getAuthFilePathCandidates(): string[] {
    const primaryAuthPath = this.getPrimaryAuthFilePath();
    const homeAuthPath = path.join(os.homedir(), ".codex", "auth.json");
    const legacyAuthPath = "/tmp/codex-config/auth.json";
    return Array.from(new Set([primaryAuthPath, homeAuthPath, legacyAuthPath]));
  }

  private resolveAuthFilePathForRead(): string | null {
    for (const candidate of this.getAuthFilePathCandidates()) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async clearLocalAuthCacheFiles(
    jobId: string,
    tenantId: string,
  ): Promise<void> {
    const removedPaths: string[] = [];

    for (const authPath of this.getAuthFilePathCandidates()) {
      if (!fs.existsSync(authPath)) {
        continue;
      }

      try {
        await fs.promises.rm(authPath, { force: true });
        removedPaths.push(authPath);
      } catch (error) {
        this.logger.warn("Failed to remove local Codex auth cache file", {
          jobId,
          tenantId,
          authPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info("Cleared local Codex auth cache files before re-auth", {
      jobId,
      tenantId,
      removedPathCount: removedPaths.length,
      removedPaths,
    });
  }

  private async hasValidAuthCache(): Promise<boolean> {
    const primaryAuthPath = this.getPrimaryAuthFilePath();
    const authPath = this.resolveAuthFilePathForRead();
    if (!authPath) {
      this.logger.info("Codex auth cache file does not exist", {
        authPathCandidates: this.getAuthFilePathCandidates(),
      });
      return false;
    }

    if (authPath !== primaryAuthPath) {
      this.logger.info("Using fallback Codex auth cache path", {
        authPath,
        primaryAuthPath,
      });
    }

    try {
      const authContent = await fs.promises.readFile(authPath, "utf-8");
      if (!authContent || authContent.trim().length === 0) {
        this.logger.warn("Codex auth cache file exists but is empty", {
          authPath,
        });
        return false;
      }

      const parsed = JSON.parse(authContent);
      const isValid = typeof parsed === "object" && parsed !== null;
      if (!isValid) {
        this.logger.warn("Codex auth cache JSON is not an object", {
          authPath,
          parsedType: typeof parsed,
        });
        return false;
      }

      this.logger.info("Codex auth cache is present and valid", {
        authPath,
        authBytes: Buffer.byteLength(authContent, "utf-8"),
      });
      return true;
    } catch (error) {
      this.logger.warn("Existing Codex auth cache is invalid", {
        authPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private parseDeviceAuthLine(line: string, state: DeviceAuthState): void {
    const parsed = parseDeviceAuthValues(line);

    if (parsed.verificationUri && !state.verificationUri) {
      state.verificationUri = parsed.verificationUri;
      this.logger.info(
        "Detected Codex device verification URL from CLI output",
      );
    }

    if (parsed.userCode && !state.userCode) {
      state.userCode = parsed.userCode;
      this.logger.info("Detected Codex device user code from CLI output", {
        codeSuffix: state.userCode.slice(-4),
      });
    }
  }

  /** Signs Codex in with a device code and uploads the login; a login it can't keep fails the sign-in. */
  private async runDeviceAuthLogin(jobId: string, tenantId: string): Promise<void> {
    this.logger.info("Preparing Codex device auth login", {
      jobId,
      tenantId,
      workDir: this.workDir,
    });

    await this.sendProgress("auth", "Starting Codex device authentication");
    this.logger.info("Starting Codex device auth login via CLI");

    const authState: DeviceAuthState = {};
    let emittedPrompt = false;
    const recentOutput: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", ["login", "--device-auth"], {
        cwd: this.workDir,
        env: sanitizeAgentEnvironment(process.env).env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.logger.info("Spawned Codex device auth CLI process", {
        jobId,
        tenantId,
        pid: child.pid,
      });

      let heartbeatTimer: NodeJS.Timeout | undefined;

      const startHeartbeat = () => {
        this.logger.info("Starting Codex device auth heartbeat reporter", {
          jobId,
          tenantId,
        });
        heartbeatTimer = setInterval(() => {
          void this.sendProgress(
            "auth",
            "Waiting for Codex device authorization",
            {
              kind: DEVICE_CODE_PROGRESS.pending,
              verificationUri: authState.verificationUri || null,
              userCode: authState.userCode || null,
            },
          );
        }, 30000);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
          this.logger.info("Stopped Codex device auth heartbeat reporter", {
            jobId,
            tenantId,
          });
        }
      };

      const maybeEmitPrompt = () => {
        if (!emittedPrompt && authState.verificationUri && authState.userCode) {
          emittedPrompt = true;
          this.logger.info("Emitting Codex device auth prompt to platform", {
            jobId,
            tenantId,
            verificationUri: authState.verificationUri,
            userCodeSuffix: authState.userCode.slice(-4),
          });
          void this.sendProgress("auth", "Codex login required", {
            kind: DEVICE_CODE_PROGRESS.required,
            verificationUri: authState.verificationUri,
            userCode: authState.userCode,
          });
        }
      };

      const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        const lines = text.split(/\r?\n/);
        for (const rawLine of lines) {
          const line = sanitizeCliOutputLine(rawLine);
          if (!line) {
            continue;
          }

          recentOutput.push(line);
          if (recentOutput.length > 12) {
            recentOutput.shift();
          }

          this.parseDeviceAuthLine(line, authState);
          maybeEmitPrompt();
        }
      };

      child.stdout.on("data", handleChunk);
      child.stderr.on("data", handleChunk);

      startHeartbeat();

      child.on("close", (code) => {
        stopHeartbeat();
        if (code === 0) {
          this.logger.info("Codex device auth CLI exited successfully", {
            jobId,
            tenantId,
            hasVerificationUri: Boolean(authState.verificationUri),
            hasUserCode: Boolean(authState.userCode),
            emittedPrompt,
          });
          resolve();
          return;
        }

        this.logger.error("Codex device auth CLI exited with non-zero status", {
          exitCode: code,
          hasVerificationUri: Boolean(authState.verificationUri),
          hasUserCode: Boolean(authState.userCode),
          recentOutput,
        });
        reject(new Error(`codex login --device-auth exited with code ${code}`));
      });

      child.on("error", (error) => {
        stopHeartbeat();
        this.logger.error("Failed to start Codex device auth CLI", {
          jobId,
          tenantId,
          error: error.message,
        });
        reject(error);
      });
    });

    await this.sendProgress("auth", "Codex device authentication completed", {
      kind: DEVICE_CODE_PROGRESS.completed,
    });
    this.logger.info("Codex device authentication completed; uploading the login", { jobId, tenantId });
    await this.uploadAuthCache(jobId, tenantId);
  }

  /**
   * Codex refreshes its tokens during a run. Uploading the refreshed login keeps the
   * stored one current, so the next run doesn't need a new device login. Best effort:
   * a failed upload costs a login later, not this run.
   */
  async uploadIfRefreshed(jobId: string, tenantId: string): Promise<void> {
    const authPath = this.resolveAuthFilePathForRead();
    if (!authPath) return;

    try {
      const authJson = await fs.promises.readFile(authPath, "utf-8");
      if (!authJson.trim() || hashAuthJson(authJson) === this.syncedAuthHash) return;

      this.logger.info("Codex refreshed its login during the run; uploading it", { jobId, tenantId });
      await this.uploadAuthCache(jobId, tenantId);
    } catch (error) {
      this.logger.warn("Failed to upload refreshed Codex login", {
        jobId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async uploadAuthCache(
    jobId: string,
    tenantId: string,
  ): Promise<void> {
    const primaryAuthPath = this.getPrimaryAuthFilePath();
    const authPath = this.resolveAuthFilePathForRead();

    if (!authPath) {
      this.logger.warn("Skipping Codex auth cache upload because file is missing", {
        jobId,
        tenantId,
        authPathCandidates: this.getAuthFilePathCandidates(),
      });
      return;
    }

    if (authPath !== primaryAuthPath) {
      this.logger.info("Uploading Codex auth cache from fallback path", {
        jobId,
        tenantId,
        authPath,
        primaryAuthPath,
      });
    }

    this.logger.info("Preparing Codex auth cache upload", {
      jobId,
      tenantId,
      authPath,
      credentialEnvVar: this.settings.credentialEnvVar,
    });

    const authJson = await fs.promises.readFile(authPath, "utf-8");
    if (!authJson || authJson.trim().length === 0) {
      this.logger.warn("Skipping Codex auth cache upload because file is empty", {
        jobId,
        tenantId,
        authPath,
      });
      return;
    }

    const compactedAuthJson = compactJsonForStorage(authJson);
    if (!compactedAuthJson) {
      this.logger.warn("Skipping Codex auth cache upload because file is empty", {
        jobId,
        tenantId,
        authPath,
      });
      return;
    }

    this.logger.info("Sending Codex auth cache upload callback", {
      jobId,
      tenantId,
      credentialEnvVar: this.settings.credentialEnvVar,
      authBytes: Buffer.byteLength(compactedAuthJson, "utf-8"),
      rawAuthBytes: Buffer.byteLength(authJson, "utf-8"),
    });
    await this.loginUploader.sendAgentLogin(jobId, tenantId, compactedAuthJson);
    this.syncedAuthHash = hashAuthJson(compactedAuthJson);
    this.logger.info("Codex auth cache upload callback succeeded", {
      jobId,
      tenantId,
      credentialEnvVar: this.settings.credentialEnvVar,
    });
  }
}
