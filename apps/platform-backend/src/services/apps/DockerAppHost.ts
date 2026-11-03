import Docker from "dockerode";
import type { AppHost, AppInstanceSpec, AppInstanceStatus } from "@viberglass/types";
import { DockerodeClientAdapter } from "../../provisioning/adapters/DockerodeClientAdapter";
import type { DockerClientPort } from "../../provisioning/ports/DockerClientPort";
import { dockerStatusCode } from "../../workers/invokers/dockerStatusCode";
import { demuxDockerLogs } from "./demuxDockerLogs";

const APP_PORT = 3000;
const LABEL = "viberglass.app";

export interface DockerAppHostOptions {
  /** The platform's own container, which joins each app's network to reach it. Null when it runs outside Docker. */
  gatewayContainer: string | null;
  /** Object storage's container, joined to each app's network under `alias` so Litestream reaches it. */
  storage: { container: string; alias: string } | null;
  memoryMb: number;
  cpus: number;
}

const names = (projectId: string) => ({
  container: `viberglass-app-${projectId}`,
  network: `viberglass-app-${projectId}`,
  volume: `viberglass-app-${projectId}-data`,
});

/**
 * Runs each app in its own container on its own bridge network, which only the
 * platform and object storage join: the app reaches the internet but not the
 * database, the workers or other apps.
 */
export class DockerAppHost implements AppHost {
  readonly target = "docker" as const;

  constructor(
    private readonly options: DockerAppHostOptions,
    private readonly docker: Docker = new Docker({ socketPath: "/var/run/docker.sock" }),
    private readonly images: Pick<DockerClientPort, "inspectImage" | "pullImage"> = new DockerodeClientAdapter(docker),
  ) {}

  async create(spec: AppInstanceSpec): Promise<void> {
    const name = names(spec.projectId);
    await this.ensureImage(spec.image);
    await this.ensureNetwork(name.network, spec.projectId);
    await this.ensureVolume(name.volume, spec.projectId);
    await this.removeContainer(name.container);
    await this.docker.createContainer({
      name: name.container,
      Image: spec.image,
      Env: Object.entries({ ...spec.env, PORT: String(APP_PORT) }).map(([key, value]) => `${key}=${value}`),
      Labels: { [LABEL]: spec.projectId },
      HostConfig: {
        NetworkMode: name.network,
        Binds: [`${name.volume}:/data`],
        RestartPolicy: { Name: "unless-stopped" },
        Memory: this.options.memoryMb * 1024 * 1024,
        NanoCpus: Math.round(this.options.cpus * 1e9),
        PidsLimit: 512,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
      },
    });
  }

  async start(projectId: string): Promise<void> {
    await this.docker.getContainer(names(projectId).container).start();
  }

  async stop(projectId: string, graceSeconds: number): Promise<void> {
    try {
      await this.docker.getContainer(names(projectId).container).stop({ t: graceSeconds });
    } catch (error) {
      // 304: already stopped; 404: never created.
      if (dockerStatusCode(error) !== 304 && dockerStatusCode(error) !== 404) throw error;
    }
  }

  async status(projectId: string): Promise<AppInstanceStatus> {
    try {
      const { State: state } = await this.docker.getContainer(names(projectId).container).inspect();
      if (state.Restarting) return { state: "restarting", detail: `The app stopped with exit code ${state.ExitCode}` };
      if (state.Running) return { state: "running" };
      return { state: "stopped", ...(state.ExitCode ? { detail: `The app stopped with exit code ${state.ExitCode}` } : {}) };
    } catch (error) {
      if (dockerStatusCode(error) === 404) return { state: "missing" };
      throw error;
    }
  }

  address(projectId: string): string {
    return `http://${names(projectId).container}:${APP_PORT}`;
  }

  async logs(projectId: string, tailLines: number): Promise<string> {
    try {
      const output = await this.docker.getContainer(names(projectId).container).logs({
        stdout: true,
        stderr: true,
        tail: tailLines,
        follow: false,
      });
      return demuxDockerLogs(output);
    } catch (error) {
      if (dockerStatusCode(error) === 404) return "";
      throw error;
    }
  }

  async clearData(projectId: string): Promise<void> {
    const name = names(projectId);
    await this.removeContainer(name.container);
    await this.removeVolume(name.volume);
  }

  async delete(projectId: string): Promise<void> {
    const name = names(projectId);
    await this.removeContainer(name.container);
    await this.removeVolume(name.volume);
    await this.removeNetwork(name.network);
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.images.inspectImage(image);
    } catch (error) {
      if (dockerStatusCode(error) !== 404) throw error;
      await this.images.pullImage({ image });
    }
  }

  private async ensureNetwork(network: string, projectId: string): Promise<void> {
    try {
      await this.docker.createNetwork({ Name: network, Driver: "bridge", Labels: { [LABEL]: projectId } });
    } catch (error) {
      if (dockerStatusCode(error) !== 409) throw error;
    }
    const joined = Object.values((await this.docker.getNetwork(network).inspect()).Containers ?? {}).map((c: { Name?: string }) => c.Name);
    const { gatewayContainer, storage } = this.options;
    if (gatewayContainer) await this.join(network, gatewayContainer, [], joined);
    if (storage) await this.join(network, storage.container, [storage.alias], joined);
  }

  private async join(network: string, container: string, aliases: string[], joined: Array<string | undefined>): Promise<void> {
    const info = await this.docker.getContainer(container).inspect();
    if (joined.includes(info.Name.replace(/^\//, ""))) return;
    await this.docker.getNetwork(network).connect({ Container: info.Id, EndpointConfig: { Aliases: aliases } });
  }

  private async ensureVolume(volume: string, projectId: string): Promise<void> {
    await this.docker.createVolume({ Name: volume, Labels: { [LABEL]: projectId } });
  }

  private async removeContainer(container: string): Promise<void> {
    try {
      await this.docker.getContainer(container).remove({ force: true });
    } catch (error) {
      if (dockerStatusCode(error) !== 404) throw error;
    }
  }

  private async removeVolume(volume: string): Promise<void> {
    try {
      await this.docker.getVolume(volume).remove();
    } catch (error) {
      if (dockerStatusCode(error) !== 404) throw error;
    }
  }

  private async removeNetwork(network: string): Promise<void> {
    try {
      const inspected = await this.docker.getNetwork(network).inspect();
      for (const id of Object.keys(inspected.Containers ?? {})) {
        await this.docker.getNetwork(network).disconnect({ Container: id, Force: true });
      }
      await this.docker.getNetwork(network).remove();
    } catch (error) {
      if (dockerStatusCode(error) !== 404) throw error;
    }
  }
}
