import Docker from "dockerode";
import path from "path";
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
} from "@aws-sdk/client-lambda";
import type { Clanker, ClankerStatus } from "@viberglass/types";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "ClankerProvisioningService" });

const DEFAULT_LOCAL_DOCKER_IMAGE = "viberator-worker:local";
const DEFAULT_DOCKERFILE_PATH =
  "infra/viberator/docker/viberator-docker-worker.Dockerfile";

interface DockerDeploymentConfig {
  containerImage?: string;
  environmentVariables?: Record<string, string>;
  networkMode?: string;
  logFilePath?: string;
}

interface EcsProvisioningConfig {
  clusterArn?: string;
  taskDefinitionArn?: string;
  taskDefinition?: RegisterTaskDefinitionCommandInput;
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
  private repoRoot: string;

  constructor() {
    this.docker = new Docker({ socketPath: "/var/run/docker.sock" });
    const region = process.env.AWS_REGION || "us-east-1";
    this.ecsClient = new ECSClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.repoRoot = path.resolve(__dirname, "../../../../");
  }

  async provisionClanker(clanker: Clanker): Promise<ProvisioningResult> {
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
        return this.provisionDocker(clanker);
      case "ecs":
        return this.provisionEcs(clanker);
      case "lambda":
        return this.provisionLambda(clanker);
      default:
        return {
          status: "inactive",
          statusMessage: `Unsupported deployment strategy: ${strategy}`,
        };
    }
  }

  async resolveAvailabilityStatus(clanker: Clanker): Promise<AvailabilityResult> {
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

  private async provisionDocker(clanker: Clanker): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as DockerDeploymentConfig;
    const containerImage = config.containerImage || DEFAULT_LOCAL_DOCKER_IMAGE;

    await this.buildDockerImage(containerImage);

    const availability = await this.checkDockerAvailability({
      ...clanker,
      deploymentConfig: { ...config, containerImage },
    });

    return {
      deploymentConfig: { ...config, containerImage },
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  private async provisionEcs(clanker: Clanker): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as EcsProvisioningConfig;
    const taskDefinitionArn = await this.ensureTaskDefinition(
      clanker,
      config,
    );

    // For managed mode, persist cluster ARN from env vars so the invoker can find it
    const clusterArn =
      config.clusterArn || process.env.VIBERATOR_ECS_CLUSTER_ARN;

    const updatedConfig = { ...config, taskDefinitionArn, clusterArn };

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

  private async provisionLambda(clanker: Clanker): Promise<ProvisioningResult> {
    const config = (clanker.deploymentConfig || {}) as LambdaProvisioningConfig;
    const functionInfo = await this.ensureLambdaFunction(clanker, config);

    const availability = await this.checkLambdaAvailability({
      ...clanker,
      deploymentConfig: {
        ...config,
        functionName: functionInfo.functionName,
        functionArn: functionInfo.functionArn,
      },
    });

    return {
      deploymentConfig: {
        ...config,
        functionName: functionInfo.functionName,
        functionArn: functionInfo.functionArn,
      },
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  private async buildDockerImage(tag: string): Promise<void> {
    const dockerfile = path.resolve(this.repoRoot, DEFAULT_DOCKERFILE_PATH);
    const dockerfileRelative = path.relative(this.repoRoot, dockerfile);
    const tar = require("tar-fs") as {
      pack: (cwd: string, options?: { ignore?: (name: string) => boolean }) =>
        NodeJS.ReadableStream;
    };

    logger.info("Building Docker image for clanker", {
      tag,
      dockerfile: dockerfileRelative,
    });

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

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private async ensureTaskDefinition(
    clanker: Clanker,
    config: EcsProvisioningConfig,
  ): Promise<string> {
    if (config.taskDefinitionArn) {
      await this.ecsClient.send(
        new DescribeTaskDefinitionCommand({
          taskDefinition: config.taskDefinitionArn,
        }),
      );
      return config.taskDefinitionArn;
    }

    const taskDefinition =
      config.taskDefinition || this.buildDefaultTaskDefinition(clanker, config);

    if (!taskDefinition.containerDefinitions?.length) {
      throw new Error("ECS task definition requires container definitions");
    }

    if (!taskDefinition.family) {
      taskDefinition.family = this.buildEcsFamilyName(clanker);
    }

    const response = await this.ecsClient.send(
      new RegisterTaskDefinitionCommand(taskDefinition),
    );

    const taskDefinitionArn = response.taskDefinition?.taskDefinitionArn;
    if (!taskDefinitionArn) {
      throw new Error("ECS task definition registration did not return an ARN");
    }

    return taskDefinitionArn;
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
      config.logGroup || process.env.VIBERATOR_ECS_LOG_GROUP || "/ecs/viberator-worker";
    const region =
      config.region || process.env.AWS_REGION || "us-east-1";

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
  ): Promise<{ functionName: string; functionArn?: string }> {
    const explicitArn = config.functionArn;
    const explicitName = config.functionName;
    const derivedName = this.buildLambdaFunctionName(clanker);
    const functionIdentifier = explicitArn || explicitName || derivedName;
    const functionName = explicitName || derivedName;

    try {
      const response = await this.lambdaClient.send(
        new GetFunctionCommand({
          FunctionName: functionIdentifier,
        }),
      );
      return {
        functionName: response.Configuration?.FunctionName || functionName,
        functionArn: response.Configuration?.FunctionArn,
      };
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err.name !== "ResourceNotFoundException") {
        throw error;
      }
      if (explicitArn) {
        throw new Error(
          `Lambda function not found for ARN: ${explicitArn}`,
        );
      }
    }

    const imageUri =
      config.imageUri || process.env.VIBERATOR_LAMBDA_IMAGE_URI;
    const roleArn = config.roleArn || process.env.VIBERATOR_LAMBDA_ROLE_ARN;
    if (!imageUri || !roleArn) {
      throw new Error("Lambda creation requires imageUri and roleArn");
    }

    const response = await this.lambdaClient.send(
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

    return {
      functionName: response.FunctionName || functionName,
      functionArn: response.FunctionArn,
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
      return { status: "active", statusMessage: null };
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
      return { status: "active", statusMessage: null };
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
      return { status: "active", statusMessage: null };
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
