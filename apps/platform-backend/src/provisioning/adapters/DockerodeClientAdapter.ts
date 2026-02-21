import Docker from "dockerode";
import type {
  BuildDockerImageParams,
  DockerClientPort,
  DockerImageInspection,
} from "../ports/DockerClientPort";

interface DockerBuildEvent {
  stream?: string;
  error?: string;
  errorDetail?: { message?: string };
}

export class DockerodeClientAdapter implements DockerClientPort {
  constructor(private readonly docker: Docker = new Docker({ socketPath: "/var/run/docker.sock" })) {}

  async buildImage(params: BuildDockerImageParams): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tar = require("tar-fs");

    const tarStream = tar.pack(params.repoRoot, {
      ignore: (name: string) =>
        name.includes("/node_modules/") ||
        name.includes("/.git/") ||
        name.includes("/dist/") ||
        name.includes("/.idea/") ||
        name.includes("/.cache/"),
    });

    const stream = await this.docker.buildImage(tarStream, {
      t: params.tag,
      dockerfile: params.dockerfileRelative,
    });

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
        (event: DockerBuildEvent) => {
          const line =
            event.stream?.trim() ||
            event.errorDetail?.message?.trim() ||
            event.error?.trim() ||
            "";

          if (line && params.onEvent) {
            params.onEvent(line);
          }
        },
      );
    });
  }

  inspectImage(imageTag: string): Promise<DockerImageInspection> {
    return this.docker.getImage(imageTag).inspect();
  }
}
