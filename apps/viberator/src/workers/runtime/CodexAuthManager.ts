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

type ProgressReporter = (
  step: string,
  message: string,
  details?: Record<string, unknown>,
) => Promise<void>;

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
    const uriMatch = line.match(/https?:\/\/[^\s)]+/i);
    if (uriMatch && !state.verificationUri) {
      state.verificationUri = uriMatch[0];
    }

    const codeMatch =
      line.match(
        /(?:device code|one-time code|verification code|enter code)[:\s]+([A-Z0-9-]{4,})/i,
      ) || line.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4,})\b/);
    if (codeMatch && !state.userCode) {
      state.userCode = codeMatch[1];
    }
  }

  private async runDeviceAuthLogin(
    jobId: string,
    tenantId: string,
  ): Promise<void> {
    await this.sendProgress("auth", "Starting Codex device authentication");

    const authState: DeviceAuthState = {};
    let emittedPrompt = false;

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
          const line = rawLine.trim();
          if (!line) {
            continue;
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

        reject(new Error(`codex login --device-auth exited with code ${code}`));
      });

      child.on("error", (error) => {
        stopHeartbeat();
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
