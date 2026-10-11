import type { Clanker, DockerStrategyConfig } from "@viberglass/types";
import { mergeProvisionedStrategyIntoConfig } from "../../clanker-config/mergeProvisionedConfig";
import type { ProvisioningStrategyHandler } from "../ProvisioningStrategyHandler";
import type { DockerClientPort } from "../ports/DockerClientPort";
import { resolveRepoRoot } from "../shared/repoRoot";
import {
  getDockerStrategyConfig,
} from "../shared/configHelpers";
import { getWorkerImageForClanker } from "../shared/workerImage";
import { getErrorMessage, isMissingDockerImageError } from "../shared/errorUtils";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "../types";
import type { DockerImageMetadata } from "./dockerTypes";
import { DockerImageBuilder } from "./DockerImageBuilder";
import { DockerImagePuller } from "./DockerImagePuller";

const DEFAULT_LOCAL_DOCKER_IMAGE = "viberator-worker:local";

/**
 * Managed mode builds the worker image under the runner's tag. Pre-built mode
 * never builds: it uses the image as is and pulls it when it isn't local.
 */
export class DockerProvisioningHandler implements ProvisioningStrategyHandler {
  private readonly imageBuilder: DockerImageBuilder;
  private readonly imagePuller: DockerImagePuller;

  constructor(
    private readonly dockerClient: DockerClientPort,
    options?: {
      repoRoot?: string;
      imageBuilder?: DockerImageBuilder;
      imagePuller?: DockerImagePuller;
    },
  ) {
    this.imageBuilder =
      options?.imageBuilder ||
      new DockerImageBuilder(dockerClient, options?.repoRoot || resolveRepoRoot());
    this.imagePuller = options?.imagePuller || new DockerImagePuller(dockerClient);
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

    const strategy = await this.prepareImage(config, containerImage, progress);
    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...strategy,
      imageMetadata: await this.getDockerImageMetadata(containerImage),
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
    // A published image is known before the runner starts; a built one only once it's built.
    const image =
      config.containerImage ||
      (config.provisioningMode === "prebuilt" ? getWorkerImageForClanker(clanker, "docker") : undefined);
    if (!image) {
      return {
        status: "inactive",
        statusMessage: "Start the runner to build its image",
      };
    }

    try {
      await this.dockerClient.inspectImage(image);
      return {
        status: "active",
        statusMessage: `Docker image ready: ${image}`,
      };
    } catch (error) {
      const message = getErrorMessage(error, "Docker image not available");
      if (isMissingDockerImageError(error)) {
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

  private async prepareImage(
    config: DockerStrategyConfig,
    containerImage: string,
    progress?: ProvisioningProgressReporter,
  ): Promise<Record<string, unknown>> {
    if (config.provisioningMode === "prebuilt") {
      await this.imagePuller.ensurePresent(containerImage, progress);
      return { ...config, containerImage, dockerBuild: undefined };
    }

    await progress?.(`Docker build started for image ${containerImage}`);
    const dockerBuild = await this.imageBuilder.build(containerImage, progress);
    return { ...config, containerImage, dockerBuild };
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
