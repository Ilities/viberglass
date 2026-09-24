export interface DockerImageInspection {
  Id?: string;
  Created?: string;
  Size?: number;
  VirtualSize?: number;
  Architecture?: string;
  Os?: string;
  RepoTags?: string[];
  RepoDigests?: string[];
}

export interface BuildDockerImageParams {
  tag: string;
  repoRoot: string;
  dockerfileRelative: string;
  onEvent?: (line: string) => void;
}

export interface DockerPullEvent {
  status?: string;
  /** Layer id for per-layer events; absent for image-level status lines. */
  id?: string;
}

export interface PullDockerImageParams {
  image: string;
  onEvent?: (event: DockerPullEvent) => void;
}

export interface DockerClientPort {
  buildImage(params: BuildDockerImageParams): Promise<void>;
  pullImage(params: PullDockerImageParams): Promise<void>;
  inspectImage(imageTag: string): Promise<DockerImageInspection>;
}
