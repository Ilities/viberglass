import { createChildLogger } from "../../config/logger";
import type { DockerClientPort, DockerPullEvent } from "../ports/DockerClientPort";
import { getErrorMessage, isMissingDockerImageError } from "../shared/errorUtils";
import type { ProvisioningProgressReporter } from "../types";

const logger = createChildLogger({ service: "DockerImagePuller" });

const LAYER_DONE_STATUSES = new Set(["Pull complete", "Already exists"]);

/**
 * Turns per-layer pull events into one progress line per finished layer
 * ("3 of 12 layers"), instead of a line per download tick.
 */
class LayerProgress {
  private readonly layers = new Set<string>();
  private readonly done = new Set<string>();

  record(event: DockerPullEvent): string | null {
    // "Pulling from org/image" carries the tag as its id; it isn't a layer.
    if (!event.id || !event.status || event.status.startsWith("Pulling from")) {
      return null;
    }
    this.layers.add(event.id);
    if (!LAYER_DONE_STATUSES.has(event.status) || this.done.has(event.id)) {
      return null;
    }
    this.done.add(event.id);
    return `${this.done.size} of ${this.layers.size} layers`;
  }
}

/** Makes sure a pre-built image is present locally, pulling it only when missing. */
export class DockerImagePuller {
  constructor(private readonly dockerClient: DockerClientPort) {}

  async ensurePresent(
    image: string,
    progress?: ProvisioningProgressReporter,
  ): Promise<void> {
    if (await this.isPresent(image)) {
      await progress?.(`Using local Docker image ${image}`);
      return;
    }

    logger.info("Pulling pre-built Docker image", { image });
    await progress?.(`Pulling Docker image ${image}`);

    const layers = new LayerProgress();
    try {
      await this.dockerClient.pullImage({
        image,
        onEvent: (event) => {
          const line = layers.record(event);
          if (line) {
            void progress?.(`Pulling Docker image ${image}: ${line}`);
          }
        },
      });
    } catch (error) {
      throw new Error(
        `Docker image ${image} isn't available locally and couldn't be pulled: ${getErrorMessage(error, "unknown error")}`,
      );
    }
  }

  private async isPresent(image: string): Promise<boolean> {
    try {
      await this.dockerClient.inspectImage(image);
      return true;
    } catch (error) {
      if (isMissingDockerImageError(error)) {
        return false;
      }
      throw error;
    }
  }
}
