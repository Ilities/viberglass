import path from "path";
import type { Clanker } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { mergeProvisionedStrategyIntoConfig } from "../../clanker-config/mergeProvisionedConfig";
import type { ProvisioningStrategyHandler } from "../ProvisioningStrategyHandler";
import type { DockerClientPort } from "../ports/DockerClientPort";
import {
  WORKER_DOCKERFILE_PATH,
  resolveRepoRoot,
} from "../shared/repoRoot";
import {
  getDockerStrategyConfig,
} from "../shared/configHelpers";
import { getWorkerImageForClanker } from "../shared/workerImage";
import { getErrorMessage, getNumericErrorCode } from "../shared/errorUtils";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "../types";
import type {
  DockerBuildResult,
  DockerImageMetadata,
} from "./dockerTypes";

const logger = createChildLogger({ service: "DockerProvisioningHandler" });
const DEFAULT_LOCAL_DOCKER_IMAGE = "viberator-worker:local";

function shouldReportDockerMilestone(line: string): boolean {
  return (
    line.startsWith("Step ") ||
    line.startsWith("Successfully") ||
    line.startsWith("exporting") ||
    line.startsWith("naming to")
  );
}

export class DockerProvisioningHandler implements ProvisioningStrategyHandler {
  private readonly repoRoot: string;

  constructor(
    private readonly dockerClient: DockerClientPort,
    options?: { repoRoot?: string },
  ) {
    this.repoRoot = options?.repoRoot || resolveRepoRoot();
  }

  getPreflightError(_clanker: Clanker): string | null {
    return null;
  }

  async provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = getDockerStrategyConfig(clanker);
    const containerImage =
      config.containerImage ||
      getWorkerImageForClanker(clanker, "docker") ||
      DEFAULT_LOCAL_DOCKER_IMAGE;

    await progress?.(`Docker build started for image ${containerImage}`);
    const dockerBuild = await this.buildDockerImage(containerImage, progress);
    const imageMetadata = await this.getDockerImageMetadata(containerImage);

    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...config,
      containerImage,
      imageMetadata,
      dockerBuild,
    });

    const availability = await this.checkAvailability({
      ...clanker,
      deploymentConfig,
    });

    return {
      deploymentConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  async checkAvailability(clanker: Clanker): Promise<AvailabilityResult> {
    const config = getDockerStrategyConfig(clanker);
    if (!config.containerImage) {
      return {
        status: "inactive",
        statusMessage: "Docker image not configured",
      };
    }

    try {
      await this.dockerClient.inspectImage(config.containerImage);
      return {
        status: "active",
        statusMessage: `Docker image ready: ${config.containerImage}`,
      };
    } catch (error) {
      const message = getErrorMessage(error, "Docker image not available");
      const statusCode = getNumericErrorCode(error, "statusCode");
      if (statusCode === 404 || message.includes("No such image")) {
        return {
          status: "inactive",
          statusMessage: "Docker image not found",
        };
      }

      return {
        status: "failed",
        statusMessage: `Docker availability check failed: ${message}`,
      };
    }
  }

  async deprovision(_clanker: Clanker): Promise<ProvisioningResult> {
    return {
      status: "inactive",
      statusMessage: "Deactivated by user",
    };
  }

  private async buildDockerImage(
    tag: string,
    progress?: ProvisioningProgressReporter,
  ): Promise<DockerBuildResult> {
    const startedAt = new Date();
    const dockerfile = path.resolve(this.repoRoot, WORKER_DOCKERFILE_PATH);
    const dockerfileRelative = path.relative(this.repoRoot, dockerfile);

    logger.info("Building Docker image for clanker", {
      tag,
      dockerfile: dockerfileRelative,
    });

    await progress?.(`Docker build using ${dockerfileRelative}`);

    const logs: string[] = [];
    await this.dockerClient.buildImage({
      tag,
      repoRoot: this.repoRoot,
      dockerfileRelative,
      onEvent: (line) => {
        logs.push(line);
        if (logs.length > 200) {
          logs.shift();
        }

        if (shouldReportDockerMilestone(line)) {
          void progress?.(`Docker build: ${line}`);
        }
      },
    });

    const completedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      logs,
    };
  }

  private async getDockerImageMetadata(
    imageTag: string,
  ): Promise<DockerImageMetadata> {
    const image = await this.dockerClient.inspectImage(imageTag);
    return {
      imageId: image.Id,
      createdAt: image.Created,
      sizeBytes: image.Size,
      virtualSizeBytes: image.VirtualSize,
      architecture: image.Architecture,
      os: image.Os,
      repoTags: image.RepoTags,
      repoDigests: image.RepoDigests,
    };
  }
}
