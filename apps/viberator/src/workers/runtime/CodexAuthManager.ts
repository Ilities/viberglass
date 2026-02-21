import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { Logger } from "winston";
import { CodexAuthSettings } from "../../config/clankerConfig";
import { CallbackClient } from "../infrastructure/CallbackClient";

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

export class CodexAuthManager {
  constructor(
    private readonly logger: Logger,
    private readonly callbackClient: CallbackClient,
    private readonly workDir: string,
    private readonly sendProgress: ProgressReporter,
    private readonly settings: CodexAuthSettings,
  ) {}

  async materializeAuthCacheFromEnv(): Promise<void> {
    const secretValue = process.env[this.settings.secretName];
    if (!secretValue || secretValue.trim().length === 0) {
      return;
    }

    const authPath = this.getAuthFilePath();
    const authDir = path.dirname(authPath);

    await fs.promises.mkdir(authDir, { recursive: true });
    await fs.promises.writeFile(authPath, secretValue, {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.promises.chmod(authPath, 0o600);

    this.logger.info("Materialized Codex auth cache from credential", {
      authPath,
      secretName: this.settings.secretName,
    });
  }

  async ensureDeviceAuth(jobId: string, tenantId: string): Promise<void> {
    await this.materializeAuthCacheFromEnv();

    if (await this.hasValidAuthCache()) {
      return;
    }

    await this.runDeviceAuthLogin(jobId, tenantId);
  }

  private getAuthFilePath(): string {
    const configDir = process.env.CODEX_CONFIG_DIR || "/tmp/codex-config";
    return path.join(configDir, "auth.json");
  }

  private async hasValidAuthCache(): Promise<boolean> {
    const authPath = this.getAuthFilePath();
    if (!fs.existsSync(authPath)) {
      return false;
    }

    try {
      const authContent = await fs.promises.readFile(authPath, "utf-8");
      if (!authContent || authContent.trim().length === 0) {
        return false;
      }

      const parsed = JSON.parse(authContent);
      return typeof parsed === "object" && parsed !== null;
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
      this.logger.info("Detected Codex device verification URL from CLI output");
    }

    if (parsed.userCode && !state.userCode) {
      state.userCode = parsed.userCode;
      this.logger.info("Detected Codex device user code from CLI output", {
        codeSuffix: state.userCode.slice(-4),
      });
    }
  }

  private async runDeviceAuthLogin(
    jobId: string,
    tenantId: string,
  ): Promise<void> {
    await this.sendProgress("auth", "Starting Codex device authentication");
    this.logger.info("Starting Codex device auth login via CLI");

    const authState: DeviceAuthState = {};
    let emittedPrompt = false;
    const recentOutput: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", ["login", "--device-auth"], {
        cwd: this.workDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let heartbeatTimer: NodeJS.Timeout | undefined;

      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          void this.sendProgress("auth", "Waiting for Codex device authorization", {
            kind: "codex_device_auth_pending",
            verificationUri: authState.verificationUri || null,
            userCode: authState.userCode || null,
          });
        }, 30000);
      };

      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
        }
      };

      const maybeEmitPrompt = () => {
        if (!emittedPrompt && authState.verificationUri && authState.userCode) {
          emittedPrompt = true;
          void this.sendProgress("auth", "Codex login required", {
            kind: "codex_device_auth_required",
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
          error: error.message,
        });
        reject(error);
      });
    });

    await this.sendProgress("auth", "Codex device authentication completed");

    try {
      await this.uploadAuthCache(jobId, tenantId);
    } catch (error) {
      this.logger.warn("Failed to upload Codex auth cache after login", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async uploadAuthCache(jobId: string, tenantId: string): Promise<void> {
    const authPath = this.getAuthFilePath();
    if (!fs.existsSync(authPath)) {
      return;
    }

    const authJson = await fs.promises.readFile(authPath, "utf-8");
    if (!authJson || authJson.trim().length === 0) {
      return;
    }

    await this.callbackClient.sendCodexAuthCache(jobId, tenantId, {
      secretName: this.settings.secretName,
      authJson,
    });
  }
}
