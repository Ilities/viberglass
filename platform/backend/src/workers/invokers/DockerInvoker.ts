import Docker from "dockerode";
import type { Clanker } from "@viberator/types";
import type { JobData } from "../../types/Job";
import { WorkerInvoker, InvocationResult } from "../WorkerInvoker";
import { WorkerError, ErrorClassification } from "../errors/WorkerError";
import fs from "fs";
import { PassThrough } from "stream";

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
      const container = await this.docker.createContainer({
        Image: dockerConfig.containerImage,
        name: `viberator-job-${job.id}`,
        Env: [
          `JOB_PAYLOAD=${JSON.stringify(payload)}`,
          `TENANT_ID=${job.tenantId}`,
          `JOB_ID=${job.id}`,
          ...this.formatEnvironmentVars(dockerConfig.environmentVariables),
        ],
        HostConfig: {
          AutoRemove: true, // Clean up after completion
          NetworkMode: dockerConfig.networkMode || "bridge",
        },
      });

      // Start container (async - returns immediately)
      await container.start();

      const containerId = container.id;

      console.info("[DockerInvoker] Container started", {
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
      clankerConfig: clanker, // Full config for Docker (no external storage)
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
        console.warn("[DockerInvoker] Log file write error", {
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
            console.error(`[DockerInvoker][${jobId}] ${trimmed}`);
          } else {
            console.info(`[DockerInvoker][${jobId}] ${trimmed}`);
          }
        }
        fileStream?.write(text);
      };

      stdout.on("data", (chunk) => write(chunk as Buffer, false));
      stderr.on("data", (chunk) => write(chunk as Buffer, true));

      logStream.on("end", () => fileStream?.end());
      logStream.on("error", (err) => {
        console.warn("[DockerInvoker] Log stream error", {
          jobId,
          error: err.message,
        });
        fileStream?.end();
      });
    } catch (err) {
      console.warn("[DockerInvoker] Failed to attach to container logs", {
        jobId,
        error: (err as Error).message,
      });
      fileStream?.end();
    }
  }
}
