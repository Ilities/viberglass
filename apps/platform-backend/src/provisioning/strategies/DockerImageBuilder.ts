import path from "path";
import { createChildLogger } from "../../config/logger";
import type { DockerClientPort } from "../ports/DockerClientPort";
import { WORKER_DOCKERFILE_PATH } from "../shared/repoRoot";
import type { ProvisioningProgressReporter } from "../types";
import type { DockerBuildResult } from "./dockerTypes";

const logger = createChildLogger({ service: "DockerImageBuilder" });
const MAX_BUILD_LOG_LINES = 200;

function shouldReportDockerMilestone(line: string): boolean {
  return (
    line.startsWith("Step ") ||
    line.startsWith("Successfully") ||
    line.startsWith("exporting") ||
    line.startsWith("naming to")
  );
}

/** Builds the multi-agent worker image from the repository's Dockerfile. */
export class DockerImageBuilder {
  constructor(
    private readonly dockerClient: DockerClientPort,
    private readonly repoRoot: string,
  ) {}

  async build(
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
        if (logs.length > MAX_BUILD_LOG_LINES) {
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
}
