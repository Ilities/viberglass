export interface DockerBuildResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  logs: string[];
}

export interface DockerImageMetadata {
  imageId?: string;
  createdAt?: string;
  sizeBytes?: number;
  virtualSizeBytes?: number;
  architecture?: string;
  os?: string;
  repoTags?: string[];
  repoDigests?: string[];
}

export interface DockerDeploymentConfig {
  containerImage?: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
  imageMetadata?: DockerImageMetadata;
  dockerBuild?: DockerBuildResult;
}
