import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { gunzipSync } from "node:zlib";
import { Logger } from "winston";
import { CodexAuthSettings } from "../../config/clankerConfig";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { CredentialProvider } from "../infrastructure/CredentialProvider";

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
const CODEX_AUTH_GZIP_PREFIX = "gz+b64:";

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

export function decodeCodexAuthFromSharedValue(secretValue: string): string {
  const trimmed = secretValue.trim();
  if (!trimmed.startsWith(CODEX_AUTH_GZIP_PREFIX)) {
    return trimmed;
  }

  const base64Payload = trimmed.slice(CODEX_AUTH_GZIP_PREFIX.length);
  const decodedBuffer = Buffer.from(base64Payload, "base64");
  return gunzipSync(decodedBuffer).toString("utf-8");
}

export class CodexAuthManager {
  constructor(
    private readonly logger: Logger,
    private readonly callbackClient: CallbackClient,
    private readonly workDir: string,
    private readonly sendProgress: ProgressReporter,
    private readonly settings: CodexAuthSettings,
    private readonly credentialProvider?: CredentialProvider,
  ) {}

  async materializeAuthCacheFromEnv(): Promise<void> {
    const secretValue = process.env[this.settings.secretName];
    if (!secretValue || secretValue.trim().length === 0) {
      this.logger.info("No Codex auth cache value found in environment", {
        secretName: this.settings.secretName,
      });
      return;
    }

    const authPath = this.getPrimaryAuthFilePath();
    const authDir = path.dirname(authPath);

    this.logger.info("Materializing Codex auth cache from environment", {
      authPath,
      secretName: this.settings.secretName,
      authBytes: Buffer.byteLength(secretValue, "utf-8"),
    });

    await fs.promises.mkdir(authDir, { recursive: true });
    await fs.promises.writeFile(authPath, secretValue, {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.promises.chmod(authPath, 0o600);

    this.logger.info("Materialized Codex auth cache from credential", {
      authPath,
      secretName: this.settings.secretName,
      authBytes: Buffer.byteLength(secretValue, "utf-8"),
    });
  }

  async ensureDeviceAuth(jobId: string, tenantId: string): Promise<void> {
    this.logger.info("Ensuring Codex auth is available for job", {
      jobId,
      tenantId,
      mode: this.settings.mode,
      secretName: this.settings.secretName,
    });

    await this.materializeAuthCacheFromEnv();

    if (await this.hasValidAuthCache()) {
      this.logger.info("Using existing Codex auth cache after env materialization", {
        jobId,
        tenantId,
      });
      return;
    }

    if (this.settings.mode === "chatgpt_device_stored") {
      this.logger.info("No valid local auth cache, attempting shared SSM auth cache", {
        jobId,
        tenantId,
      });
      await this.materializeAuthCacheFromSsm();

      if (await this.hasValidAuthCache()) {
        this.logger.info("Using shared Codex auth cache from SSM", {
          jobId,
          tenantId,
        });
        return;
      }

      this.logger.info("Shared auth cache unavailable, starting interactive Codex device login", {
        jobId,
        tenantId,
        requireAuthCacheUpload: true,
      });
      await this.runDeviceAuthLogin(jobId, tenantId, {
        requireAuthCacheUpload: true,
      });
      return;
    }

    this.logger.info("Starting interactive Codex device login", {
      jobId,
      tenantId,
      mode: this.settings.mode,
      requireAuthCacheUpload: false,
    });
    await this.runDeviceAuthLogin(jobId, tenantId, {
      requireAuthCacheUpload: false,
    });
  }

  async forceFreshDeviceAuth(jobId: string, tenantId: string): Promise<void> {
    this.logger.warn("Forcing fresh Codex device auth after token failure", {
      jobId,
      tenantId,
      mode: this.settings.mode,
      secretName: this.settings.secretName,
    });

    await this.clearLocalAuthCacheFiles(jobId, tenantId);
    await this.runDeviceAuthLogin(jobId, tenantId, {
      requireAuthCacheUpload: true,
    });
  }

  private getPrimaryAuthFilePath(): string {
    const configDir =
      process.env.CODEX_CONFIG_DIR ||
      process.env.CODEX_HOME ||
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

  private async runDeviceAuthLogin(
    jobId: string,
    tenantId: string,
    options: { requireAuthCacheUpload: boolean },
  ): Promise<void> {
    this.logger.info("Preparing Codex device auth login", {
      jobId,
      tenantId,
      requireAuthCacheUpload: options.requireAuthCacheUpload,
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
        env: process.env,
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
              kind: "codex_device_auth_pending",
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

    await this.sendProgress("auth", "Codex device authentication completed");
    this.logger.info("Codex device authentication completed", {
      jobId,
      tenantId,
      requireAuthCacheUpload: options.requireAuthCacheUpload,
    });

    try {
      this.logger.info("Uploading Codex auth cache after login", {
        jobId,
        tenantId,
        secretName: this.settings.secretName,
      });
      await this.uploadAuthCache(jobId, tenantId);
      this.logger.info("Uploaded Codex auth cache after login", {
        jobId,
        tenantId,
        secretName: this.settings.secretName,
      });
    } catch (error) {
      if (options.requireAuthCacheUpload) {
        this.logger.error("Failed to upload required Codex auth cache after login", {
          jobId,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      this.logger.warn("Failed to upload Codex auth cache after login", {
        jobId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getSharedAuthSsmPath(): string {
    // Use CredentialProvider's path construction when available for consistency
    if (this.credentialProvider) {
      return this.credentialProvider.getSharedParameterName(this.settings.secretName);
    }
    
    // Fallback to legacy path construction
    const prefix = (
      process.env.SECRETS_SSM_PREFIX || "/viberator/secrets"
    ).replace(/\/+$/, "");
    const normalizedSecretName = this.settings.secretName.replace(/^\/+/, "");
    return `${prefix}/${normalizedSecretName}`;
  }

  private async materializeAuthCacheFromSsm(): Promise<void> {
    const authPath = this.getPrimaryAuthFilePath();
    const authDir = path.dirname(authPath);
    const parameterName = this.getSharedAuthSsmPath();

    this.logger.info("Attempting to materialize Codex auth cache from shared SSM", {
      authPath,
      parameterName,
      usingCredentialProvider: Boolean(this.credentialProvider),
    });

    try {
      let secretValue: string | undefined;
      
      if (this.credentialProvider) {
        // Use CredentialProvider for consistent SSM fetching
        secretValue = await this.credentialProvider.getRawSsmValue(parameterName);
      } else {
        // Fallback: check environment variable (for Docker workers)
        secretValue = process.env[this.settings.secretName];
      }
      
      if (!secretValue || secretValue.trim().length === 0) {
        this.logger.info("Shared SSM Codex auth cache is missing or empty", {
          parameterName,
        });
        return;
      }

      const materializedAuthJson = decodeCodexAuthFromSharedValue(secretValue);
      if (!materializedAuthJson || materializedAuthJson.trim().length === 0) {
        this.logger.info("Shared SSM Codex auth cache decoded to empty payload", {
          parameterName,
        });
        return;
      }

      await fs.promises.mkdir(authDir, { recursive: true });
      await fs.promises.writeFile(authPath, materializedAuthJson, {
        encoding: "utf-8",
        mode: 0o600,
      });
      await fs.promises.chmod(authPath, 0o600);

      this.logger.info("Materialized Codex auth cache from shared SSM", {
        authPath,
        parameterName,
        authBytes: Buffer.byteLength(materializedAuthJson, "utf-8"),
        rawAuthBytes: Buffer.byteLength(secretValue, "utf-8"),
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : undefined;
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorName === "ParameterNotFound") {
        this.logger.info("Shared Codex auth cache parameter not found", {
          parameterName,
        });
        return;
      }
      if (
        errorName === "AccessDeniedException" ||
        errorName === "UnrecognizedClientException" ||
        errorName === "InvalidClientTokenId" ||
        errorName === "ExpiredTokenException" ||
        errorName === "CredentialsProviderError"
      ) {
        this.logger.error("Failed to read shared Codex auth cache from SSM due to auth error", {
          parameterName,
          errorName,
          errorMessage,
        });
        throw new Error(
          `Failed to read shared Codex auth cache from SSM at ${parameterName}: ${errorName}`,
        );
      }

      this.logger.error("Failed to read shared Codex auth cache from SSM", {
        parameterName,
        errorName: errorName || "UnknownError",
        errorMessage,
      });
      throw new Error(
        `Failed to read shared Codex auth cache from SSM at ${parameterName}`,
      );
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
      secretName: this.settings.secretName,
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
      secretName: this.settings.secretName,
      authBytes: Buffer.byteLength(compactedAuthJson, "utf-8"),
      rawAuthBytes: Buffer.byteLength(authJson, "utf-8"),
    });
    await this.callbackClient.sendCodexAuthCache(jobId, tenantId, {
      secretName: this.settings.secretName,
      authJson: compactedAuthJson,
    });
    this.logger.info("Codex auth cache upload callback succeeded", {
      jobId,
      tenantId,
      secretName: this.settings.secretName,
    });
  }
}
