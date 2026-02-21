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

export interface DockerClientPort {
  buildImage(params: BuildDockerImageParams): Promise<void>;
  inspectImage(imageTag: string): Promise<DockerImageInspection>;
}
