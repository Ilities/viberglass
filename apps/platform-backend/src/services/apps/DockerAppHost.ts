import Docker from "dockerode";
import type { AppHost, AppInstanceSpec, AppInstanceStatus } from "@viberglass/types";
import { DockerodeClientAdapter } from "../../provisioning/adapters/DockerodeClientAdapter";
import type { DockerClientPort } from "../../provisioning/ports/DockerClientPort";
import { dockerStatusCode } from "../../workers/invokers/dockerStatusCode";
import { appContainer } from "./appContainer";
import type { AppSubnetPool } from "./AppSubnetPool";
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
  /** Where app networks take their subnets from. */
  subnets: AppSubnetPool;
}

const names = (instance: string) => ({
  container: `viberglass-${instance}`,
  network: `viberglass-${instance}`,
  volume: `viberglass-${instance}-data`,
  // Where the release is unpacked; kept across restarts, since the bundle's URL expires.
  releaseVolume: `viberglass-${instance}-release`,
});

/**
 * Runs each app and each preview in its own container on its own bridge
 * network, which only the platform and object storage join: the app reaches the
 * internet but not the database, the workers or other apps.
 */
export class DockerAppHost implements AppHost {
  readonly target = "docker" as const;

  constructor(
    private readonly options: DockerAppHostOptions,
    private readonly docker: Docker = new Docker({ socketPath: "/var/run/docker.sock" }),
    private readonly images: Pick<DockerClientPort, "inspectImage" | "pullImage"> = new DockerodeClientAdapter(docker),
  ) {}

  async create(spec: AppInstanceSpec): Promise<void> {
    const name = names(spec.instance);
    await this.ensureImage(spec.image);
    await this.ensureNetwork(name.network, spec.projectId);
    await this.ensureVolume(name.volume, spec.projectId);
    await this.ensureVolume(name.releaseVolume, spec.projectId);
    await this.removeContainer(name.container);
    await this.docker.createContainer(appContainer(spec, name, { port: APP_PORT, label: LABEL, memoryMb: this.options.memoryMb, cpus: this.options.cpus }));
  }

  async start(instance: string): Promise<void> {
    await this.docker.getContainer(names(instance).container).start();
  }

  async stop(instance: string, graceSeconds: number): Promise<void> {
    try {
      await this.docker.getContainer(names(instance).container).stop({ t: graceSeconds });
    } catch (error) {
      // 304: already stopped; 404: never created.
      if (dockerStatusCode(error) !== 304 && dockerStatusCode(error) !== 404) throw error;
    }
  }

  async status(instance: string): Promise<AppInstanceStatus> {
    try {
      const { State: state } = await this.docker.getContainer(names(instance).container).inspect();
      if (state.Restarting) return { state: "restarting", detail: `The app stopped with exit code ${state.ExitCode}` };
      if (state.Running) return { state: "running" };
      return { state: "stopped", ...(state.ExitCode ? { detail: `The app stopped with exit code ${state.ExitCode}` } : {}) };
    } catch (error) {
      if (dockerStatusCode(error) === 404) return { state: "missing" };
      throw error;
    }
  }

  address(instance: string): string {
    return `http://${names(instance).container}:${APP_PORT}`;
  }

  async logs(instance: string, tailLines: number): Promise<string> {
    try {
      const output = await this.docker.getContainer(names(instance).container).logs({
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

  async clearData(instance: string): Promise<void> {
    const name = names(instance);
    await this.removeContainer(name.container);
    await this.removeVolume(name.volume);
  }

  async delete(instance: string): Promise<void> {
    const name = names(instance);
    await this.removeContainer(name.container);
    await this.removeVolume(name.volume);
    await this.removeVolume(name.releaseVolume);
    await this.removeNetwork(name.network);
  }

  /** A recreated platform or storage container has left every app network; this puts it back. */
  /** Nothing outlives a space's instances on Docker. */
  async forgetSpace(): Promise<void> {}

  async rejoinPlatform(projectIds: string[]): Promise<void> {
    const ours = new Set(projectIds);
    const networks = await this.docker.listNetworks({ filters: { label: [LABEL] } });
    for (const network of networks) {
      if (!ours.has(network.Labels?.[LABEL] ?? "")) continue;
      try {
        await this.joinPlatform(network.Name);
      } catch (error) {
        // A preview removed since the list was read.
        if (dockerStatusCode(error) !== 404) throw error;
      }
    }
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
    const existing = await this.subnetOf(network);
    if (!(existing && this.options.subnets.contains(existing))) {
      if (existing !== undefined) await this.removeNetwork(network);
      await this.createNetwork(network, projectId);
    }
    await this.joinPlatform(network);
  }

  /** The network's subnet; null when it has none, undefined when there's no such network. */
  private async subnetOf(network: string): Promise<string | null | undefined> {
    try {
      const inspected = await this.docker.getNetwork(network).inspect();
      return inspected.IPAM?.Config?.[0]?.Subnet ?? null;
    } catch (error) {
      if (dockerStatusCode(error) === 404) return undefined;
      throw error;
    }
  }

  // Another app can take the same subnet between listing and creating; Docker refuses the overlap, so try the next.
  private async createNetwork(network: string, projectId: string, attemptsLeft = 5): Promise<void> {
    const used = (await this.docker.listNetworks()).flatMap((n) => (n.IPAM?.Config ?? []).map((config) => config.Subnet ?? ""));
    const subnet = this.options.subnets.free(used);
    if (!subnet) throw new Error("No free subnet is left for app networks. Make APPS_NETWORK_POOL larger.");
    try {
      await this.docker.createNetwork({ Name: network, Driver: "bridge", Labels: { [LABEL]: projectId }, IPAM: { Config: [{ Subnet: subnet }] } });
    } catch (error) {
      if (dockerStatusCode(error) === 409) return;
      const overlapped = dockerStatusCode(error) === 403 || dockerStatusCode(error) === 400;
      if (!overlapped || attemptsLeft <= 1) throw error;
      await this.createNetwork(network, projectId, attemptsLeft - 1);
    }
  }

  private async joinPlatform(network: string): Promise<void> {
    const joined = Object.values((await this.docker.getNetwork(network).inspect()).Containers ?? {}).map((c: { Name?: string }) => c.Name);
    const { gatewayContainer, storage } = this.options;
    if (gatewayContainer) await this.join(network, gatewayContainer, [], joined);
    if (storage) await this.join(network, storage.container, [storage.alias], joined);
  }

  private async join(network: string, container: string, aliases: string[], joined: Array<string | undefined>): Promise<void> {
    const info = await this.docker.getContainer(container).inspect();
    if (joined.includes(info.Name.replace(/^\//, ""))) return;
    // Below the platform's own network, so that one keeps carrying the container's published ports.
    const endpoint: Docker.EndpointSettings & { GwPriority: number } = { Aliases: aliases, GwPriority: -1 };
    await this.docker.getNetwork(network).connect({ Container: info.Id, EndpointConfig: endpoint });
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
