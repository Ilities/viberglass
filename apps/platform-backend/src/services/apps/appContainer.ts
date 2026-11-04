import type Docker from "dockerode";
import type { AppInstanceSpec } from "@viberglass/types";

interface Names {
  container: string;
  network: string;
  volume: string;
  releaseVolume: string;
}

interface Limits {
  port: number;
  label: string;
  memoryMb: number;
  cpus: number;
}

/**
 * One app's container: its own network, its data and release on volumes, a
 * read-only root, and limits on memory, processes, files and logs.
 */
export function appContainer(spec: AppInstanceSpec, name: Names, limits: Limits): Docker.ContainerCreateOptions {
  const memory = limits.memoryMb * 1024 * 1024;
  return {
    name: name.container,
    Image: spec.image,
    // The root filesystem is read-only, so caches that tools keep under HOME go to /tmp.
    Env: Object.entries({ ...spec.env, PORT: String(limits.port), HOME: "/tmp" }).map(([key, value]) => `${key}=${value}`),
    Labels: { [limits.label]: spec.projectId },
    HostConfig: {
      NetworkMode: name.network,
      Binds: [`${name.volume}:/data`, `${name.releaseVolume}:/app`],
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,exec,nosuid,nodev,size=512m" },
      RestartPolicy: { Name: "unless-stopped" },
      Memory: memory,
      MemorySwap: memory,
      NanoCpus: Math.round(limits.cpus * 1e9),
      PidsLimit: 512,
      Ulimits: [{ Name: "nofile", Soft: 8192, Hard: 8192 }],
      LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
    },
  };
}
