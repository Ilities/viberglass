import Docker from "dockerode";
import type { Clanker } from "@viberator/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import fs from "fs";
import { PassThrough } from "stream";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ invoker: "Docker" });

// Cache for image availability to avoid repeated checks
const imageAvailabilityCache = new Map<string, boolean>();
const CACHE_TTL = 60000; // 1 minute

interface DockerDeploymentConfig {
  containerImage: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
}

export class DockerInvoker implements WorkerInvoker {
  readonly name = "DockerInvoker";
  private docker: Docker;

  constructor(config?: { socketPath?: string; host?: string; port?: number }) {
    this.docker = new Docker({
      socketPath: config?.socketPath || "/var/run/docker.sock",
      host: config?.host,
      port: config?.port,
    });
  }

  async invoke(job: JobData, clanker: Clanker): Promise<InvocationResult> {
    const dockerConfig = clanker.deploymentConfig as unknown as
      | DockerDeploymentConfig
      | undefined;

    if (!dockerConfig?.containerImage) {
      throw new WorkerError(
        "Docker container image required in clanker deploymentConfig",
        ErrorClassification.PERMANENT,
      );
    }

    const payload = this.buildPayload(job, clanker);

    try {
      // Create container with unique name
      const jsonPayload = JSON.stringify(payload);

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

      const container = await this.docker.createContainer({
        Image: dockerConfig.containerImage,
        name: `viberator-job-${job.id}`,
        Env: [
          `TENANT_ID=${job.tenantId}`,
          `JOB_ID=${job.id}`,
          `PLATFORM_API_URL=${platformApiUrl}`,
          ...this.formatEnvironmentVars(dockerConfig.environmentVariables),
        ],
        Cmd: ["node", "dist/cli-worker.js", "--job-data", jsonPayload],
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

  private buildPayload(job: JobData, clanker: Clanker): object {
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
      instructionFiles: job.context?.instructionFiles ?? [],
      clankerConfig: clanker, // Full config for Docker (no external storage)
    };
  }

  async isAvailable(clanker?: Clanker): Promise<boolean> {
    try {
      await this.docker.ping();
    } catch {
      return false;
    }

    // If clanker is provided, check if the image exists locally
    if (clanker) {
      const dockerConfig = clanker.deploymentConfig as unknown as
        | DockerDeploymentConfig
        | undefined;

      if (!dockerConfig?.containerImage) {
        return false;
      }

      return await this.checkImageExists(dockerConfig.containerImage);
    }

    return true;
  }

  private async checkImageExists(imageName: string): Promise<boolean> {
    // Check cache first
    const cached = imageAvailabilityCache.get(imageName);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const images = await this.docker.listImages();
      const exists = images.some(img => {
        const tags = img.RepoTags || [];
        // Check exact match or with/without latest tag
        return tags.includes(imageName) ||
               tags.includes(`${imageName}:latest`) ||
               imageName === `${img.Id.substring(0, 12)}` ||
               imageName.startsWith(`${img.Id.substring(0, 12)}:`) ||
               tags.some(tag => tag.includes(imageName.split(':')[0]) &&
                            (!imageName.includes(':') || tag === imageName));
      });

      // Cache the result
      imageAvailabilityCache.set(imageName, exists);
      // Invalidate cache after TTL
      setTimeout(() => imageAvailabilityCache.delete(imageName), CACHE_TTL);

      return exists;
    } catch (error) {
      logger.warn("Failed to check Docker image existence", {
        imageName,
        error: error instanceof Error ? error.message : error,
      });
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
