import Docker from "dockerode";
import type { Clanker, Project } from "@viberglass/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import fs from "fs";
import { PassThrough } from "stream";
import { createChildLogger } from "../../config/logger";
import { SecretResolutionService } from "../../services/SecretResolutionService";

const logger = createChildLogger({ invoker: "Docker" });

interface DockerDeploymentConfig {
  containerImage: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
}

export class DockerInvoker implements WorkerInvoker {
  readonly name = "DockerInvoker";
  private docker: Docker;
  private secretResolutionService: SecretResolutionService;

  constructor(config?: { socketPath?: string; host?: string; port?: number }) {
    this.docker = new Docker({
      socketPath: config?.socketPath || "/var/run/docker.sock",
      host: config?.host,
      port: config?.port,
    });
    this.secretResolutionService = new SecretResolutionService();
  }

  async invoke(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<InvocationResult> {
    logger.debug(
      `Invoking job ${job.id} with Docker invoker with config: \n${JSON.stringify(clanker.deploymentConfig, null, 2)}`,
    );
    const dockerConfig = clanker.deploymentConfig as unknown as
      | DockerDeploymentConfig
      | undefined;

    if (!dockerConfig?.containerImage) {
      throw new WorkerError(
        "Docker container image required in clanker deploymentConfig",
        ErrorClassification.PERMANENT,
      );
    }

    const payload = job.bootstrapPayload || this.buildPayload(job, clanker, project);

    let secretEnvironment: Record<string, string> = {};
    try {
      secretEnvironment =
        await this.secretResolutionService.resolveSecretsForClanker(
          clanker.secretIds || [],
        );
    } catch (error) {
      throw new WorkerError(
        `Secret resolution failed: ${(error as Error).message}`,
        ErrorClassification.PERMANENT,
        error,
      );
    }

    try {
      // Create container with unique name
      const jsonPayload = JSON.stringify(payload);
      const workerSsmEnvironment: Record<string, string> = {
        SECRETS_SSM_PREFIX:
          process.env.SECRETS_SSM_PREFIX || "/viberator/secrets",
      };

      if (process.env.SSM_PARAMETER_PREFIX) {
        workerSsmEnvironment.SSM_PARAMETER_PREFIX =
          process.env.SSM_PARAMETER_PREFIX;
      }

      // Determine platform API URL for Docker container
      // Priority: env var > host network mode > bridge network with host.docker.internal
      // Note: On Linux, host.docker.internal requires --add-host or using bridge IP
      let platformApiUrl = process.env.PLATFORM_API_URL;

      if (!platformApiUrl) {
        if (dockerConfig.networkMode === "host") {
          // Host network mode: use localhost
          platformApiUrl = "http://localhost:8888";
        } else {
          // Bridge network: try host.docker.internal (works on Docker Desktop)
          // For Linux, users should set PLATFORM_API_URL env var or use host network
          platformApiUrl = "http://host.docker.internal:8888";
        }
      }

      // On Linux, add host.docker.internal mapping for bridge network
      const extraHosts: string[] = [];
      if (
        process.platform === "linux" &&
        (!dockerConfig.networkMode || dockerConfig.networkMode === "bridge")
      ) {
        extraHosts.push("host.docker.internal:host-gateway");
      }

      const canUseJobRef = Boolean(job.bootstrapPayload && job.callbackToken);

      const container = await this.docker.createContainer({
        Image: dockerConfig.containerImage,
        name: `viberator-job-${job.id}`,
        Env: [
          `TENANT_ID=${job.tenantId}`,
          `JOB_ID=${job.id}`,
          `PLATFORM_API_URL=${platformApiUrl}`,
          ...(canUseJobRef && job.callbackToken
            ? [`CALLBACK_TOKEN=${job.callbackToken}`]
            : []),
          ...this.formatEnvironmentVars({
            ...workerSsmEnvironment,
            ...secretEnvironment,
            ...dockerConfig.environmentVariables,
          }),
        ],
        Cmd: canUseJobRef
          ? ["node", "dist/cli-worker.js", "--job-ref", job.id]
          : ["node", "dist/cli-worker.js", "--job-data", jsonPayload],
        HostConfig: {
          AutoRemove: true, // Clean up after completion
          NetworkMode: dockerConfig.networkMode || "host",
          ExtraHosts: extraHosts.length > 0 ? extraHosts : undefined,
        },
      });

      // Start container (async - returns immediately)
      await container.start();

      const containerId = container.id;

      logger.info("Container started", {
        jobId: job.id,
        containerId,
        image: dockerConfig.containerImage,
        payloadMode: canUseJobRef ? "job-ref" : "inline",
      });

      void this.streamContainerLogs(
        container,
        job.id,
        dockerConfig.logFilePath,
      );

      return {
        executionId: containerId,
        workerType: "docker",
      };
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  private classifyError(error: unknown): WorkerError {
    const err = error as Error;
    const message = err.message || "";

    // Transient: Docker daemon unavailable, network issues
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ETIMEDOUT") ||
      message.includes("socket hang up") ||
      message.includes("connect ENOENT")
    ) {
      return new WorkerError(
        `Docker daemon connection failed (transient): ${message}`,
        ErrorClassification.TRANSIENT,
        error,
      );
    }

    // Container name collision - could be transient (container didn't clean up)
    if (message.includes("Conflict") && message.includes("already in use")) {
      return new WorkerError(
        `Container name collision (transient): ${message}`,
        ErrorClassification.TRANSIENT,
        error,
      );
    }

    // Permanent: Image not found, invalid config
    return new WorkerError(
      `Docker container failed (permanent): ${message}`,
      ErrorClassification.PERMANENT,
      error,
    );
  }

  private formatEnvironmentVars(vars?: Record<string, string>): string[] {
    if (!vars) return [];
    return Object.entries(vars).map(([key, value]) => `${key}=${value}`);
  }

  private buildPayload(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): object {
    return {
      workerType: "docker",
      tenantId: job.tenantId,
      jobId: job.id,
      clankerId: clanker.id,
      repository: job.repository,
      task: job.task,
      branch: job.branch,
      baseBranch: job.baseBranch,
      context: job.context,
      settings: job.settings,
      callbackToken: job.callbackToken,
      instructionFiles: job.context?.instructionFiles ?? [],
      clankerConfig: clanker, // Full config for Docker (no external storage)
      projectConfig: project
        ? {
            id: project.id,
            name: project.name,
            autoFixTags: project.autoFixTags,
            customFieldMappings: project.customFieldMappings,
            workerSettings: project.workerSettings,
          }
        : undefined,
      overrides: job.overrides,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async streamContainerLogs(
    container: Docker.Container,
    jobId: string,
    logFilePath?: string,
  ): Promise<void> {
    let fileStream: fs.WriteStream | undefined;

    if (logFilePath) {
      fileStream = fs.createWriteStream(logFilePath, { flags: "a" });
      fileStream.on("error", (err) => {
        logger.warn("Log file write error", {
          jobId,
          error: err.message,
        });
      });
    }

    try {
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
      });

      const stdout = new PassThrough();
      const stderr = new PassThrough();

      this.docker.modem.demuxStream(logStream, stdout, stderr);

      const write = (chunk: Buffer, isError: boolean) => {
        const text = chunk.toString("utf8");
        const trimmed = text.trimEnd();
        if (trimmed.length > 0) {
          if (isError) {
            logger.error("Container stderr", { jobId, message: trimmed });
          } else {
            logger.debug("Container stdout", { jobId, message: trimmed });
          }
        }
        fileStream?.write(text);
      };

      stdout.on("data", (chunk) => write(chunk as Buffer, false));
      stderr.on("data", (chunk) => write(chunk as Buffer, true));

      logStream.on("end", () => fileStream?.end());
      logStream.on("error", (err) => {
        logger.warn("Log stream error", {
          jobId,
          error: err.message,
        });
        fileStream?.end();
      });
    } catch (err) {
      logger.warn("Failed to attach to container logs", {
        jobId,
        error: (err as Error).message,
      });
      fileStream?.end();
    }
  }
}
