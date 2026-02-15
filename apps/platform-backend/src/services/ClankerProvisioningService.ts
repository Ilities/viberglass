import Docker from "dockerode";
import path from "path";
import { existsSync } from "fs";
import {
  ECSClient,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
  type RegisterTaskDefinitionCommandInput,
} from "@aws-sdk/client-ecs";
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import type { Clanker, ClankerStatus } from "@viberglass/types";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "ClankerProvisioningService" });

const DEFAULT_LOCAL_DOCKER_IMAGE = "viberator-worker:local";
const DEFAULT_DOCKERFILE_PATH =
  "infra/workers/docker/viberator-docker-worker.Dockerfile";

function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ];

  const matching = candidates.find((candidate) =>
    existsSync(path.resolve(candidate, DEFAULT_DOCKERFILE_PATH)),
  );

  return matching || path.resolve(cwd, "../..");
}

type ProvisioningProgressReporter = (
  statusMessage: string,
) => Promise<void> | void;

// Get the appropriate worker image based on clanker configuration
function getWorkerImageForClanker(
  clanker: Clanker,
  strategy: "docker" | "ecs" | "lambda",
): string | undefined {
  const agentType = clanker.agent;
  const deploymentConfig = clanker.deploymentConfig as Record<string, unknown>;

  // If explicitly configured, use that
  const explicitImage =
    strategy === "docker"
      ? (deploymentConfig?.containerImage as string)
      : strategy === "ecs"
        ? (deploymentConfig?.containerImage as string)
        : (deploymentConfig?.imageUri as string);

  if (explicitImage) {
    return explicitImage;
  }

  // Auto-select based on agent type if available in environment
  const imagePrefix = process.env.VIBERATOR_WORKER_IMAGE_PREFIX || "";
  const registry = process.env.VIBERATOR_WORKER_REGISTRY || "";

  // Agent-specific images
  if (agentType === "qwen-cli" || agentType === "qwen-api") {
    return buildImageUrl(registry, imagePrefix, "qwen", strategy);
  }
  if (agentType === "gemini-cli") {
    return buildImageUrl(registry, imagePrefix, "gemini", strategy);
  }
  if (agentType === "mistral-vibe") {
    return buildImageUrl(registry, imagePrefix, "mistral", strategy);
  }
  if (agentType === "codex") {
    return buildImageUrl(registry, imagePrefix, "codex", strategy);
  }
  if (agentType === "opencode") {
    return buildImageUrl(registry, imagePrefix, "opencode", strategy);
  }
  if (agentType === "kimi-code") {
    return buildImageUrl(registry, imagePrefix, "kimi", strategy);
  }

  // Default to multi-agent image for flexibility
  return buildImageUrl(registry, imagePrefix, "multi-agent", strategy);
}

function buildImageUrl(
  registry: string,
  prefix: string,
  suffix: string,
  _strategy: "docker" | "ecs" | "lambda",
): string {
  const parts = [registry, prefix, `viberator-worker-${suffix}`].filter(
    Boolean,
  );
  return parts.join("/");
}

interface DockerBuildResult {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  logs: string[];
}

interface DockerImageMetadata {
  imageId?: string;
  createdAt?: string;
  sizeBytes?: number;
  virtualSizeBytes?: number;
  architecture?: string;
  os?: string;
  repoTags?: string[];
  repoDigests?: string[];
}

interface EcsTaskDefinitionDetails {
  taskDefinitionArn?: string;
  family?: string;
  revision?: number;
  status?: string;
  registeredAt?: string;
  registeredBy?: string;
  networkMode?: string;
  cpu?: string;
  memory?: string;
  requiresCompatibilities?: string[];
  containerImages?: Array<{
    name?: string;
    image?: string;
  }>;
}

interface LambdaFunctionDetails {
  functionName?: string;
  functionArn?: string;
  imageUri?: string;
  roleArn?: string;
  version?: string;
  state?: string;
  lastModified?: string;
  memorySize?: number;
  timeout?: number;
  architectures?: string[];
}

interface DockerDeploymentConfig {
  containerImage?: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
  imageMetadata?: DockerImageMetadata;
  dockerBuild?: DockerBuildResult;
}

interface EcsProvisioningConfig {
  clusterArn?: string;
  taskDefinitionArn?: string;
  taskDefinition?: RegisterTaskDefinitionCommandInput;
  taskDefinitionDetails?: EcsTaskDefinitionDetails;
  family?: string;
  containerImage?: string;
  containerName?: string;
  executionRoleArn?: string;
  taskRoleArn?: string;
  cpu?: string;
  memory?: string;
  logGroup?: string;
  logStreamPrefix?: string;
  region?: string;
}

interface LambdaProvisioningConfig {
  functionName?: string;
  functionArn?: string;
  functionDetails?: LambdaFunctionDetails;
  imageUri?: string;
  roleArn?: string;
  memorySize?: number;
  timeout?: number;
  environment?: Record<string, string>;
  architecture?: "x86_64" | "arm64";
  vpc?: {
    subnetIds?: string[];
    securityGroupIds?: string[];
  };
  region?: string;
}

interface ProvisioningResult {
  deploymentConfig?: Record<string, unknown> | null;
  status: ClankerStatus;
  statusMessage?: string | null;
}

interface AvailabilityResult {
  status: ClankerStatus;
  statusMessage?: string | null;
}

export class ClankerProvisioningService {
  private docker: Docker;
  private ecsClient: ECSClient;
  private lambdaClient: LambdaClient;
  private readonly repoRoot: string;

  constructor() {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
    const region = process.env.AWS_REGION || "eu-west-1";
    this.ecsClient = new ECSClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.repoRoot = resolveRepoRoot();
  }

  async provisionClanker(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const strategy = this.normalizeStrategyName(
      clanker.deploymentStrategy?.name,
    );

    if (!strategy) {
      return {
        status: "inactive",
        statusMessage: "Deployment strategy not configured",
      };
    }

    switch (strategy) {
      case "docker":
        return this.provisionDocker(clanker, progress);
      case "ecs":
        return this.provisionEcs(clanker, progress);
      case "lambda":
        return this.provisionLambda(clanker, progress);
      default:
        return {
          status: "inactive",
          statusMessage: `Unsupported deployment strategy: ${strategy}`,
        };
    }
  }

  async resolveAvailabilityStatus(
    clanker: Clanker,
  ): Promise<AvailabilityResult> {
    const strategy = this.normalizeStrategyName(
      clanker.deploymentStrategy?.name,
    );

    if (!strategy) {
      return {
        status: "inactive",
        statusMessage: "Deployment strategy not configured",
      };
    }

    switch (strategy) {
      case "docker":
        return this.checkDockerAvailability(clanker);
      case "ecs":
        return this.checkEcsAvailability(clanker);
      case "lambda":
        return this.checkLambdaAvailability(clanker);
      default:
        return {
          status: "inactive",
          statusMessage: `Unsupported deployment strategy: ${strategy}`,
        };
    }
  }

  private normalizeStrategyName(
    name: string | undefined,
  ): "docker" | "ecs" | "lambda" | null {
    if (!name) return null;
    const normalized = name.toLowerCase();
    if (normalized === "aws-lambda-container") return "lambda";
    if (normalized === "lambda") return "lambda";
    if (normalized === "ecs") return "ecs";
    if (normalized === "docker") return "docker";
    return null;
  }

  private async provisionDocker(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as DockerDeploymentConfig;
    const containerImage =
      config.containerImage ||
      getWorkerImageForClanker(clanker, "docker") ||
      DEFAULT_LOCAL_DOCKER_IMAGE;

    await progress?.(`Docker build started for image ${containerImage}`);
    const buildResult = await this.buildDockerImage(containerImage, progress);
    const imageMetadata = await this.getDockerImageMetadata(containerImage);

    const updatedConfig: Record<string, unknown> = {
      ...config,
      containerImage,
      imageMetadata,
      dockerBuild: buildResult,
    };

    const availability = await this.checkDockerAvailability({
      ...clanker,
      deploymentConfig: updatedConfig,
    });

    return {
      deploymentConfig: updatedConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  private async provisionEcs(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as EcsProvisioningConfig;

    // Auto-select container image if not specified
    if (!config.containerImage) {
      const selectedImage = getWorkerImageForClanker(clanker, "ecs");
      if (selectedImage) {
        config.containerImage = selectedImage;
      }
    }

    await progress?.("Registering ECS task definition...");
    const { taskDefinitionArn, taskDefinitionDetails } =
      await this.ensureTaskDefinition(clanker, config);

    // For managed mode, persist cluster ARN from env vars so the invoker can find it
    const clusterArn =
      config.clusterArn || process.env.VIBERATOR_ECS_CLUSTER_ARN;

    const updatedConfig: Record<string, unknown> = {
      ...config,
      taskDefinitionArn,
      taskDefinitionDetails,
      clusterArn,
    };

    const availability = await this.checkEcsAvailability({
      ...clanker,
      deploymentConfig: updatedConfig,
    });

    return {
      deploymentConfig: updatedConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  private async provisionLambda(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as LambdaProvisioningConfig;

    // Auto-select image URI if not specified
    if (!config.imageUri) {
      const selectedImage = getWorkerImageForClanker(clanker, "lambda");
      if (selectedImage) {
        config.imageUri = selectedImage;
      }
    }

    await progress?.("Deploying Lambda function...");
    const functionInfo = await this.ensureLambdaFunction(clanker, config, progress);

    const updatedConfig: Record<string, unknown> = {
      ...config,
      functionName: functionInfo.functionName,
      functionArn: functionInfo.functionArn,
      functionDetails: functionInfo.functionDetails,
    };

    const availability = await this.checkLambdaAvailability({
      ...clanker,
      deploymentConfig: updatedConfig,
    });

    return {
      deploymentConfig: updatedConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  private async buildDockerImage(
    tag: string,
    progress?: ProvisioningProgressReporter,
  ): Promise<DockerBuildResult> {
    const startedAt = new Date();
    const dockerfile = path.resolve(this.repoRoot, DEFAULT_DOCKERFILE_PATH);
    const dockerfileRelative = path.relative(this.repoRoot, dockerfile);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tar = require("tar-fs") as {
      pack: (
        cwd: string,
        options?: { ignore?: (name: string) => boolean },
      ) => NodeJS.ReadableStream;
    };

    logger.info("Building Docker image for clanker", {
      tag,
      dockerfile: dockerfileRelative,
    });

    await progress?.(`Docker build using ${dockerfileRelative}`);

    const tarStream = tar.pack(this.repoRoot, {
      ignore: (name: string) =>
        name.includes("/node_modules/") ||
        name.includes("/.git/") ||
        name.includes("/dist/") ||
        name.includes("/.idea/") ||
        name.includes("/.cache/"),
    });

    const stream = await this.docker.buildImage(tarStream, {
      t: tag,
      dockerfile: dockerfileRelative,
    });

    const logs: string[] = [];
    const pushLogLine = (line: string) => {
      const normalized = line.trimEnd();
      if (!normalized) return;
      logs.push(normalized);
      if (logs.length > 200) {
        logs.shift();
      }
    };

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        },
        (event: {
          stream?: string;
          error?: string;
          errorDetail?: { message?: string };
        }) => {
          const line =
            event.stream?.trim() ||
            event.errorDetail?.message?.trim() ||
            event.error?.trim() ||
            "";

          if (!line) {
            return;
          }

          pushLogLine(line);

          // Surface only major milestones in status updates.
          if (
            line.startsWith("Step ") ||
            line.startsWith("Successfully") ||
            line.startsWith("exporting") ||
            line.startsWith("naming to")
          ) {
            void progress?.(`Docker build: ${line}`);
          }
        },
      );
    });

    const completedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      logs,
    };
  }

  private async getDockerImageMetadata(
    imageTag: string,
  ): Promise<DockerImageMetadata> {
    const image = await this.docker.getImage(imageTag).inspect();

    return {
      imageId: image.Id,
      createdAt: image.Created,
      sizeBytes: image.Size,
      virtualSizeBytes: image.VirtualSize,
      architecture: image.Architecture,
      os: image.Os,
      repoTags: image.RepoTags,
      repoDigests: image.RepoDigests,
    };
  }

  private async ensureTaskDefinition(
    clanker: Clanker,
    config: EcsProvisioningConfig,
  ): Promise<{
    taskDefinitionArn: string;
    taskDefinitionDetails: EcsTaskDefinitionDetails;
  }> {
    const taskDefinition =
      config.taskDefinition ||
      (await this.buildTaskDefinitionFromExisting(config)) ||
      this.buildDefaultTaskDefinition(clanker, config);

    const nextTaskDefinition: RegisterTaskDefinitionCommandInput = {
      ...taskDefinition,
    };

    // If container image is explicitly requested, inject it into the selected container.
    if (config.containerImage && nextTaskDefinition.containerDefinitions?.length) {
      const targetContainerName =
        config.containerName || nextTaskDefinition.containerDefinitions[0]?.name;

      nextTaskDefinition.containerDefinitions =
        nextTaskDefinition.containerDefinitions.map((container) =>
          container.name === targetContainerName
            ? { ...container, image: config.containerImage }
            : container,
        );
    }

    if (!nextTaskDefinition.containerDefinitions?.length) {
      throw new Error("ECS task definition requires container definitions");
    }

    if (!nextTaskDefinition.family) {
      nextTaskDefinition.family = this.buildEcsFamilyName(clanker);
    }

    const response = await this.ecsClient.send(
      new RegisterTaskDefinitionCommand(nextTaskDefinition),
    );

    const registeredTaskDefinition = response.taskDefinition;
    const taskDefinitionArn = registeredTaskDefinition?.taskDefinitionArn;
    if (!taskDefinitionArn) {
      throw new Error("ECS task definition registration did not return an ARN");
    }

    return {
      taskDefinitionArn,
      taskDefinitionDetails: this.mapTaskDefinitionDetails(registeredTaskDefinition),
    };
  }

  private async buildTaskDefinitionFromExisting(
    config: EcsProvisioningConfig,
  ): Promise<RegisterTaskDefinitionCommandInput | null> {
    if (!config.taskDefinitionArn) {
      return null;
    }

    const existing = await this.ecsClient.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: config.taskDefinitionArn,
      }),
    );

    const taskDefinition = existing.taskDefinition;
    if (!taskDefinition) {
      return null;
    }

    return {
      family: taskDefinition.family,
      taskRoleArn: taskDefinition.taskRoleArn,
      executionRoleArn: taskDefinition.executionRoleArn,
      networkMode: taskDefinition.networkMode,
      containerDefinitions: taskDefinition.containerDefinitions,
      volumes: taskDefinition.volumes,
      placementConstraints: taskDefinition.placementConstraints,
      requiresCompatibilities: taskDefinition.requiresCompatibilities,
      cpu: taskDefinition.cpu,
      memory: taskDefinition.memory,
      proxyConfiguration: taskDefinition.proxyConfiguration,
      inferenceAccelerators: taskDefinition.inferenceAccelerators,
      pidMode: taskDefinition.pidMode,
      ipcMode: taskDefinition.ipcMode,
      ephemeralStorage: taskDefinition.ephemeralStorage,
      runtimePlatform: taskDefinition.runtimePlatform,
    };
  }

  private mapTaskDefinitionDetails(taskDefinition: any): EcsTaskDefinitionDetails {
    if (!taskDefinition) {
      return {};
    }

    return {
      taskDefinitionArn: taskDefinition.taskDefinitionArn,
      family: taskDefinition.family,
      revision: taskDefinition.revision,
      status: taskDefinition.status,
      registeredAt: taskDefinition.registeredAt
        ? new Date(taskDefinition.registeredAt).toISOString()
        : undefined,
      registeredBy: taskDefinition.registeredBy,
      networkMode: taskDefinition.networkMode,
      cpu: taskDefinition.cpu,
      memory: taskDefinition.memory,
      requiresCompatibilities: taskDefinition.requiresCompatibilities,
      containerImages:
        taskDefinition.containerDefinitions?.map(
          (container: { name?: string; image?: string }) => ({
            name: container.name,
            image: container.image,
          }),
        ) || [],
    };
  }

  private buildDefaultTaskDefinition(
    clanker: Clanker,
    config: EcsProvisioningConfig,
  ): RegisterTaskDefinitionCommandInput {
    const executionRoleArn =
      config.executionRoleArn || process.env.VIBERATOR_ECS_EXECUTION_ROLE_ARN;
    const taskRoleArn =
      config.taskRoleArn || process.env.VIBERATOR_ECS_TASK_ROLE_ARN;
    const containerImage =
      config.containerImage || process.env.VIBERATOR_ECS_CONTAINER_IMAGE;
    const logGroup =
      config.logGroup ||
      process.env.VIBERATOR_ECS_LOG_GROUP ||
      "/ecs/viberator-worker";
    const region = config.region || process.env.AWS_REGION || "eu-west-1";

    if (!executionRoleArn || !taskRoleArn || !containerImage) {
      throw new Error(
        "ECS task definition requires executionRoleArn, taskRoleArn, and containerImage",
      );
    }

    return {
      family: config.family || this.buildEcsFamilyName(clanker),
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: config.cpu || process.env.VIBERATOR_ECS_CPU || "1024",
      memory: config.memory || process.env.VIBERATOR_ECS_MEMORY || "2048",
      executionRoleArn,
      taskRoleArn,
      containerDefinitions: [
        {
          name: config.containerName || "worker",
          image: containerImage,
          essential: true,
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroup,
              "awslogs-region": region,
              "awslogs-stream-prefix": config.logStreamPrefix || "ecs",
            },
          },
        },
      ],
    };
  }

  private buildEcsFamilyName(clanker: Clanker): string {
    const base = clanker.slug || clanker.id;
    return `viberator-worker-${base}`.slice(0, 255);
  }

  private async ensureLambdaFunction(
    clanker: Clanker,
    config: LambdaProvisioningConfig,
    progress?: ProvisioningProgressReporter,
  ): Promise<{
    functionName: string;
    functionArn?: string;
    functionDetails: LambdaFunctionDetails;
  }> {
    const explicitArn = config.functionArn;
    const explicitName = config.functionName;
    const derivedName = this.buildLambdaFunctionName(clanker);
    const functionIdentifier = explicitArn || explicitName || derivedName;
    const functionName = explicitName || derivedName;

    let existingResponse: any = null;

    try {
      existingResponse = await this.lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionIdentifier,
        }),
      );
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name !== "ResourceNotFoundException") {
        throw error;
      }
      if (explicitArn) {
        throw new Error(`Lambda function not found for ARN: ${explicitArn}`);
      }
    }

    const imageUri =
      config.imageUri ||
      process.env.VIBERATOR_LAMBDA_IMAGE_URI ||
      existingResponse?.Code?.ImageUri;

    if (existingResponse) {
      if (imageUri) {
        await progress?.(`Updating Lambda image for ${functionName}...`);
        await this.lambdaClient.send(
          new UpdateFunctionCodeCommand({
            FunctionName: functionIdentifier,
            ImageUri: imageUri,
          }),
        );
      }

      const configurationUpdate: Record<string, unknown> = {
        FunctionName: functionIdentifier,
      };

      if (config.roleArn) configurationUpdate.Role = config.roleArn;
      if (config.memorySize !== undefined)
        configurationUpdate.MemorySize = config.memorySize;
      if (config.timeout !== undefined) configurationUpdate.Timeout = config.timeout;
      if (config.environment) {
        configurationUpdate.Environment = { Variables: config.environment };
      }
      if (config.architecture) {
        configurationUpdate.Architectures = [config.architecture];
      }
      if (config.vpc) {
        configurationUpdate.VpcConfig = {
          SubnetIds: config.vpc.subnetIds,
          SecurityGroupIds: config.vpc.securityGroupIds,
        };
      }

      if (Object.keys(configurationUpdate).length > 1) {
        await progress?.(`Updating Lambda configuration for ${functionName}...`);
        await this.lambdaClient.send(
          new UpdateFunctionConfigurationCommand(configurationUpdate as any),
        );
      }
    } else {
      const roleArn = config.roleArn || process.env.VIBERATOR_LAMBDA_ROLE_ARN;
      if (!imageUri || !roleArn) {
        throw new Error("Lambda creation requires imageUri and roleArn");
      }

      await progress?.(`Creating Lambda function ${functionName}...`);
      await this.lambdaClient.send(
        new CreateFunctionCommand({
          FunctionName: functionName,
          Role: roleArn,
          Code: { ImageUri: imageUri },
          PackageType: "Image",
          MemorySize: config.memorySize,
          Timeout: config.timeout,
          Environment: config.environment
            ? { Variables: config.environment }
            : undefined,
          Architectures: config.architecture ? [config.architecture] : undefined,
          VpcConfig: config.vpc
            ? {
                SubnetIds: config.vpc.subnetIds,
                SecurityGroupIds: config.vpc.securityGroupIds,
              }
            : undefined,
        }),
      );
    }

    const refreshed = await this.lambdaClient.send(
      new GetFunctionCommand({
        FunctionName: functionIdentifier,
      }),
    );

    return {
      functionName: refreshed.Configuration?.FunctionName || functionName,
      functionArn: refreshed.Configuration?.FunctionArn,
      functionDetails: this.mapLambdaFunctionDetails(refreshed),
    };
  }

  private mapLambdaFunctionDetails(response: any): LambdaFunctionDetails {
    return {
      functionName: response.Configuration?.FunctionName,
      functionArn: response.Configuration?.FunctionArn,
      imageUri: response.Code?.ImageUri,
      roleArn: response.Configuration?.Role,
      version: response.Configuration?.Version,
      state: response.Configuration?.State,
      lastModified: response.Configuration?.LastModified,
      memorySize: response.Configuration?.MemorySize,
      timeout: response.Configuration?.Timeout,
      architectures: response.Configuration?.Architectures,
    };
  }

  private buildLambdaFunctionName(clanker: Clanker): string {
    const base = `viberator-${clanker.slug || clanker.id}`;
    return base.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
  }

  private async checkDockerAvailability(
    clanker: Clanker,
  ): Promise<AvailabilityResult> {
    const config = (clanker.deploymentConfig || {}) as DockerDeploymentConfig;
    if (!config.containerImage) {
      return {
        status: "inactive",
        statusMessage: "Docker image not configured",
      };
    }

    try {
      await this.docker.getImage(config.containerImage).inspect();
      return {
        status: "active",
        statusMessage: `Docker image ready: ${config.containerImage}`,
      };
    } catch (error) {
      const err = error as { message?: string; statusCode?: number };
      const message = err.message || "Docker image not available";
      if (err.statusCode === 404 || message.includes("No such image")) {
        return { status: "inactive", statusMessage: "Docker image not found" };
      }
      return {
        status: "failed",
        statusMessage: `Docker availability check failed: ${message}`,
      };
    }
  }

  private async checkEcsAvailability(
    clanker: Clanker,
  ): Promise<AvailabilityResult> {
    const config = (clanker.deploymentConfig || {}) as EcsProvisioningConfig;
    if (!config.taskDefinitionArn) {
      return {
        status: "inactive",
        statusMessage: "ECS task definition not configured",
      };
    }

    try {
      await this.ecsClient.send(
        new DescribeTaskDefinitionCommand({
          taskDefinition: config.taskDefinitionArn,
        }),
      );
      return {
        status: "active",
        statusMessage: `ECS task definition ready: ${config.taskDefinitionArn}`,
      };
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name === "ClientException") {
        return {
          status: "inactive",
          statusMessage: "ECS task definition not found",
        };
      }
      return {
        status: "failed",
        statusMessage: `ECS availability check failed: ${
          err.message || "Unknown error"
        }`,
      };
    }
  }

  private async checkLambdaAvailability(
    clanker: Clanker,
  ): Promise<AvailabilityResult> {
    const config = (clanker.deploymentConfig || {}) as LambdaProvisioningConfig;
    const functionName = config.functionArn || config.functionName;
    if (!functionName) {
      return {
        status: "inactive",
        statusMessage: "Lambda function not configured",
      };
    }

    try {
      await this.lambdaClient.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      );
      return {
        status: "active",
        statusMessage: `Lambda function ready: ${functionName}`,
      };
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name === "ResourceNotFoundException") {
        return {
          status: "inactive",
          statusMessage: "Lambda function not found",
        };
      }
      return {
        status: "failed",
        statusMessage: `Lambda availability check failed: ${
          err.message || "Unknown error"
        }`,
      };
    }
  }
}
