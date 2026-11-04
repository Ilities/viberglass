import type { ContainerDefinition, RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";
import { appDataPath, appReleasesPath, type AppInstanceSpec } from "@viberglass/types";
import { replicaPolicy } from "./StsAppDataCredentials";

export const APP_PORT = 3000;
// The runtime image's `node` user.
const APP_UID = 1000;
const VOLUMES = [
  { name: "data", path: "/data" },
  // start-release.sh unpacks the bundle here, and runs the app's start script from /tmp.
  { name: "release", path: "/app" },
  { name: "tmp", path: "/tmp" },
];

/** The ECS service, its task definition family and its Cloud Map service. */
export function ecsAppNames(prefix: string, instance: string): { service: string; discovery: string } {
  return { service: `${prefix}-${instance}`, discovery: instance };
}

/** The task role an App space's live app uses, or the one its previews share. */
export function ecsAppRoleName(prefix: string, projectId: string, preview: boolean): string {
  return `${prefix}-${preview ? "preview" : "app"}-${projectId}`;
}

export interface EcsAppTaskOptions {
  region: string;
  cpu: string;
  memory: string;
  executionRoleArn: string;
  taskRoleArn: string;
  logGroup: string;
  stopGraceSeconds: number;
}

export function ecsAppTags(spec: Pick<AppInstanceSpec, "instance" | "projectId">): { key: string; value: string }[] {
  return [
    { key: "viberglass:app-instance", value: spec.instance },
    { key: "viberglass:app-project", value: spec.projectId },
  ];
}

/**
 * One app's task: the runtime image as uid 1000 on a read-only root, with its
 * data, release and /tmp on the task's scratch storage. Fargate mounts those
 * as root, so a short init container hands them to the app's user first.
 */
export function ecsAppTaskDefinition(spec: AppInstanceSpec, family: string, options: EcsAppTaskOptions): RegisterTaskDefinitionCommandInput {
  const mountPoints = VOLUMES.map((volume) => ({ sourceVolume: volume.name, containerPath: volume.path, readOnly: false }));
  const logConfiguration = (stream: string): ContainerDefinition["logConfiguration"] => ({
    logDriver: "awslogs",
    options: { "awslogs-group": options.logGroup, "awslogs-region": options.region, "awslogs-stream-prefix": stream },
  });
  const env = { ...spec.env, PORT: String(APP_PORT), HOME: "/tmp" };
  return {
    family,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    // Bundles carry native modules built for the builder's architecture.
    runtimePlatform: { operatingSystemFamily: "LINUX", cpuArchitecture: "X86_64" },
    cpu: options.cpu,
    memory: options.memory,
    executionRoleArn: options.executionRoleArn,
    taskRoleArn: options.taskRoleArn,
    volumes: VOLUMES.map((volume) => ({ name: volume.name })),
    containerDefinitions: [
      {
        name: "volumes",
        image: spec.image,
        essential: false,
        user: "0",
        entryPoint: ["sh", "-c"],
        command: [`chown ${APP_UID}:${APP_UID} ${VOLUMES.map((volume) => volume.path).join(" ")}`],
        readonlyRootFilesystem: true,
        mountPoints,
        logConfiguration: logConfiguration(spec.instance),
      },
      {
        name: "app",
        image: spec.image,
        essential: true,
        user: `${APP_UID}:${APP_UID}`,
        readonlyRootFilesystem: true,
        environment: Object.entries(env).map(([name, value]) => ({ name, value })),
        portMappings: [{ name: "http", containerPort: APP_PORT, protocol: "tcp" }],
        stopTimeout: options.stopGraceSeconds,
        linuxParameters: { capabilities: { drop: ["ALL"] } },
        mountPoints,
        dependsOn: [{ containerName: "volumes", condition: "SUCCESS" }],
        logConfiguration: logConfiguration(spec.instance),
      },
    ],
    tags: ecsAppTags(spec),
  };
}

/** What an app's own task role may do: its replica, and reading its release bundles. */
export function ecsAppRolePolicy(bucket: string, projectId: string, preview: boolean): Record<string, unknown> {
  const replica = replicaPolicy(bucket, appDataPath(projectId), { readOnly: preview }) as { Statement: unknown[] };
  return {
    Version: "2012-10-17",
    Statement: [
      ...replica.Statement,
      { Effect: "Allow", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucket}/${appReleasesPath(projectId)}/*`] },
    ],
  };
}

/** Only ECS tasks in this account take the role. */
export function ecsAppTrustPolicy(accountId: string): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole",
      Condition: { StringEquals: { "aws:SourceAccount": accountId } },
    }],
  };
}
