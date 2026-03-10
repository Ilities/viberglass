import Docker from "dockerode";
import tar from "tar-fs";
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
      let buildError: string | undefined;

      this.docker.modem.followProgress(
        stream,
        (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          if (buildError) {
            reject(new Error(`Docker build failed: ${buildError}`));
            return;
          }
          resolve();
        },
        (event: DockerBuildEvent) => {
          if (event.error) {
            buildError = event.errorDetail?.message?.trim() || event.error.trim();
          }

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
