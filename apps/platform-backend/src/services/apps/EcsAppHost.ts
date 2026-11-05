import type { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import type { ECS, Service, Task } from "@aws-sdk/client-ecs";
import type { IAM } from "@aws-sdk/client-iam";
import type { ServiceDiscovery } from "@aws-sdk/client-servicediscovery";
import { isPreviewInstance, type AppHost, type AppInstanceSpec, type AppInstanceStatus } from "@viberglass/types";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import {
  APP_PORT,
  ecsAppNames,
  ecsAppTags,
  ecsAppTaskDefinition,
} from "./ecsAppResources";
import { EcsAppRoles } from "./EcsAppRoles";

export interface EcsAppClient {
  ecs: Pick<
    ECS,
    | "registerTaskDefinition"
    | "deregisterTaskDefinition"
    | "listTaskDefinitions"
    | "createService"
    | "updateService"
    | "deleteService"
    | "describeServices"
    | "listTasks"
    | "describeTasks"
  >;
  discovery: Pick<ServiceDiscovery, "createService" | "listServices" | "getService" | "deleteService">;
  iam: Pick<IAM, "getRole" | "createRole" | "putRolePolicy" | "deleteRolePolicy" | "deleteRole">;
  logs: Pick<CloudWatchLogs, "getLogEvents">;
}

export async function createEcsAppClient(region: string): Promise<EcsAppClient> {
  const [{ ECS }, { ServiceDiscovery }, { IAM }, { CloudWatchLogs }] = await Promise.all([
    import("@aws-sdk/client-ecs"),
    import("@aws-sdk/client-servicediscovery"),
    import("@aws-sdk/client-iam"),
    import("@aws-sdk/client-cloudwatch-logs"),
  ]);
  return { ecs: new ECS({ region }), discovery: new ServiceDiscovery({ region }), iam: new IAM({ region }), logs: new CloudWatchLogs({ region }) };
}

export interface EcsAppHostOptions {
  region: string;
  /** Starts every service, task family and role name, such as dev-viberglass. */
  prefix: string;
  cluster: string;
  subnetIds: string[];
  securityGroupId: string;
  assignPublicIp: boolean;
  executionRoleArn: string;
  logGroup: string;
  /** The Cloud Map private DNS namespace apps are found in. */
  namespace: { id: string; name: string };
  rolePath: string;
  permissionsBoundaryArn: string;
  /** The bucket apps' replicas and release bundles are in. */
  bucket: string;
  size: { cpu: string; memory: string };
}

const POLL_MS = 3000;
// Fargate takes a while to stop a task and release its network interface.
const STOP_WAIT_MS = 180_000;
// A deleted service drains before its name can be used again.
const DRAIN_WAIT_MS = 300_000;
// Stop reasons a new task won't get past without someone changing something.
const STUCK_REASONS = ["CannotPullContainerError", "ResourceInitializationError", "CannotStartContainerError"];

/**
 * Runs each app and each preview as an ECS service on Fargate with at most one
 * task, found by the platform through Cloud Map. A task's data lives on its
 * scratch storage and is restored from the replica every time it starts. Each
 * App space's tasks take a role of their own that only reaches its replica.
 */
export class EcsAppHost implements AppHost {
  readonly target = "ecs" as const;
  private client: Promise<EcsAppClient> | null = null;
  private readonly roles: EcsAppRoles;

  constructor(
    private readonly options: EcsAppHostOptions,
    private readonly clientFactory: () => Promise<EcsAppClient> = () => createEcsAppClient(options.region),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {
    this.roles = new EcsAppRoles(options, async () => (await this.aws()).iam, sleep);
  }

  async create(spec: AppInstanceSpec): Promise<void> {
    const aws = await this.aws();
    const name = this.names(spec.instance).service;
    await this.stop(spec.instance, 1);
    const taskRoleArn = await this.roles.ensure(spec.projectId, isPreviewInstance(spec.instance));
    const registryArn = await this.ensureDiscovery(spec.instance);
    const registered = await aws.ecs.registerTaskDefinition(ecsAppTaskDefinition(spec, name, {
      region: this.options.region,
      cpu: this.options.size.cpu,
      memory: this.options.size.memory,
      executionRoleArn: this.options.executionRoleArn,
      taskRoleArn,
      logGroup: this.options.logGroup,
      stopGraceSeconds: APP_STOP_GRACE_SECONDS,
    }));
    const taskDefinition = registered.taskDefinition?.taskDefinitionArn;
    if (!taskDefinition) throw new Error(`ECS registered no task definition for ${name}`);

    let service = await this.service(spec.instance);
    if (service?.status === "DRAINING") {
      await this.waitUntil(async () => (await this.service(spec.instance))?.status !== "DRAINING", DRAIN_WAIT_MS, `The app's previous service ${name} is still being removed`);
      service = await this.service(spec.instance);
    }
    if (service?.status === "ACTIVE") {
      await aws.ecs.updateService({ cluster: this.options.cluster, service: name, taskDefinition, desiredCount: 0 });
      if (service.taskDefinition && service.taskDefinition !== taskDefinition) {
        await aws.ecs.deregisterTaskDefinition({ taskDefinition: service.taskDefinition }).catch(() => undefined);
      }
      return;
    }
    await aws.ecs.createService({
      cluster: this.options.cluster,
      serviceName: name,
      taskDefinition,
      desiredCount: 0,
      launchType: "FARGATE",
      // One task at most, and a new one only once the old one has stopped: an app has one SQLite writer.
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100 },
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.options.subnetIds,
          securityGroups: [this.options.securityGroupId],
          assignPublicIp: this.options.assignPublicIp ? "ENABLED" : "DISABLED",
        },
      },
      serviceRegistries: [{ registryArn }],
      propagateTags: "SERVICE",
      tags: ecsAppTags(spec),
    });
  }

  async start(instance: string): Promise<void> {
    const aws = await this.aws();
    await aws.ecs.updateService({ cluster: this.options.cluster, service: this.names(instance).service, desiredCount: 1 });
  }

  /** Waits until every task has stopped, so a backup taken next has Litestream's last sync. */
  async stop(instance: string, graceSeconds: number): Promise<void> {
    const service = await this.service(instance);
    if (service?.status !== "ACTIVE") return;
    const aws = await this.aws();
    if (service.desiredCount !== 0) {
      await aws.ecs.updateService({ cluster: this.options.cluster, service: this.names(instance).service, desiredCount: 0 });
    }
    await this.waitUntil(
      async () => (await this.tasks(instance)).every((task) => task.lastStatus === "STOPPED"),
      graceSeconds * 1000 + STOP_WAIT_MS,
      `The app's task didn't stop`,
    );
  }

  async status(instance: string): Promise<AppInstanceStatus> {
    const service = await this.service(instance);
    if (service?.status !== "ACTIVE") return { state: "missing" };
    if (!service.desiredCount) return { state: "stopped" };

    const tasks = await this.tasks(instance);
    const current = tasks.filter((task) => task.desiredStatus === "RUNNING");
    if (current.some((task) => task.lastStatus === "RUNNING" && appContainer(task)?.lastStatus === "RUNNING")) return { state: "running" };
    if (current.length > 0) return { state: "starting" };

    // Stopped tasks of earlier releases say nothing about this one.
    const failed = newest(tasks.filter((task) => task.lastStatus === "STOPPED" && task.taskDefinitionArn === service.taskDefinition));
    const reason = failed?.stoppedReason ?? "";
    if (failed?.stopCode === "TaskFailedToStart" && STUCK_REASONS.some((stuck) => reason.includes(stuck))) {
      return { state: "stopped", detail: `The app couldn't start: ${reason}` };
    }
    const exitCode = failed && appContainer(failed)?.exitCode;
    if (failed?.stopCode === "EssentialContainerExited" && typeof exitCode === "number") {
      return { state: "restarting", detail: `The app stopped with exit code ${exitCode}` };
    }
    return { state: "starting" };
  }

  address(instance: string): string {
    return `http://${this.names(instance).discovery}.${this.options.namespace.name}:${APP_PORT}`;
  }

  async logs(instance: string, tailLines: number): Promise<string> {
    const task = newest(await this.tasks(instance));
    const taskId = task?.taskArn?.split("/").pop();
    if (!taskId) return "";
    const aws = await this.aws();
    try {
      const { events } = await aws.logs.getLogEvents({
        logGroupName: this.options.logGroup,
        logStreamName: `${instance}/app/${taskId}`,
        limit: tailLines,
        startFromHead: false,
      });
      return (events ?? []).map((event) => event.message ?? "").join("\n");
    } catch (error) {
      // The task hasn't written anything yet.
      if (awsErrorName(error) === "ResourceNotFoundException") return "";
      throw error;
    }
  }

  /** A task's data never outlives it: every start restores from the replica. */
  async clearData(): Promise<void> {}

  async delete(instance: string): Promise<void> {
    const aws = await this.aws();
    const name = this.names(instance).service;
    const service = await this.service(instance);
    if (service?.status === "ACTIVE") {
      await aws.ecs.deleteService({ cluster: this.options.cluster, service: name, force: true });
    }
    if (service && service.status !== "INACTIVE") {
      await this.waitUntil(async () => {
        const current = await this.service(instance);
        return !current || current.status === "INACTIVE";
      }, DRAIN_WAIT_MS, `The app's service ${name} didn't go away`);
    }
    await this.deleteDiscovery(instance);
    const { taskDefinitionArns } = await aws.ecs.listTaskDefinitions({ familyPrefix: name, status: "ACTIVE" });
    for (const taskDefinition of taskDefinitionArns ?? []) {
      // A family prefix also matches longer names.
      if (taskDefinition.split("/").pop()?.replace(/:\d+$/, "") !== name) continue;
      await aws.ecs.deregisterTaskDefinition({ taskDefinition });
    }
  }

  /** Services and security groups don't change when the platform's tasks are replaced. */
  async rejoinPlatform(): Promise<void> {}

  async forgetSpace(projectId: string): Promise<void> {
    await this.roles.remove(projectId);
  }

  private names(instance: string) {
    return ecsAppNames(this.options.prefix, instance);
  }

  private aws(): Promise<EcsAppClient> {
    this.client ??= this.clientFactory().catch((error: unknown) => {
      this.client = null;
      throw error;
    });
    return this.client;
  }

  private async service(instance: string): Promise<Service | null> {
    const aws = await this.aws();
    const { services } = await aws.ecs.describeServices({ cluster: this.options.cluster, services: [this.names(instance).service] });
    return services?.[0] ?? null;
  }

  /** The service's tasks, running or stopped in the last hour or so. */
  private async tasks(instance: string): Promise<Task[]> {
    const aws = await this.aws();
    const serviceName = this.names(instance).service;
    const arns: string[] = [];
    for (const desiredStatus of ["RUNNING", "STOPPED"] as const) {
      try {
        const { taskArns } = await aws.ecs.listTasks({ cluster: this.options.cluster, serviceName, desiredStatus, maxResults: 100 });
        arns.push(...(taskArns ?? []));
      } catch (error) {
        // ECS refuses to list the tasks of a service that doesn't exist.
        if (awsErrorName(error) === "ServiceNotFoundException") return [];
        throw error;
      }
    }
    if (arns.length === 0) return [];
    const tasks: Task[] = [];
    for (let i = 0; i < arns.length; i += 100) {
      const { tasks: described } = await aws.ecs.describeTasks({ cluster: this.options.cluster, tasks: arns.slice(i, i + 100) });
      tasks.push(...(described ?? []));
    }
    return tasks;
  }

  private async discoveryId(instance: string): Promise<string | null> {
    const aws = await this.aws();
    const name = this.names(instance).discovery;
    let NextToken: string | undefined;
    do {
      const page = await aws.discovery.listServices({ Filters: [{ Name: "NAMESPACE_ID", Values: [this.options.namespace.id], Condition: "EQ" }], NextToken });
      const found = page.Services?.find((service) => service.Name === name);
      if (found?.Id) return found.Id;
      NextToken = page.NextToken;
    } while (NextToken);
    return null;
  }

  private async ensureDiscovery(instance: string): Promise<string> {
    const aws = await this.aws();
    const existing = await this.discoveryId(instance);
    if (existing) {
      const arn = (await aws.discovery.getService({ Id: existing })).Service?.Arn;
      if (arn) return arn;
    }
    const { Service: created } = await aws.discovery.createService({
      Name: this.names(instance).discovery,
      NamespaceId: this.options.namespace.id,
      DnsConfig: { RoutingPolicy: "MULTIVALUE", DnsRecords: [{ Type: "A", TTL: 10 }] },
      // ECS reports the task's health, so a stopping task leaves DNS first.
      HealthCheckCustomConfig: {},
    });
    if (!created?.Arn) throw new Error(`Cloud Map created no service for ${instance}`);
    return created.Arn;
  }

  /** ECS deregisters the service's tasks as they stop; until then Cloud Map refuses. */
  private async deleteDiscovery(instance: string): Promise<void> {
    const aws = await this.aws();
    const id = await this.discoveryId(instance);
    if (!id) return;
    await this.waitUntil(async () => {
      try {
        await aws.discovery.deleteService({ Id: id });
        return true;
      } catch (error) {
        const name = awsErrorName(error);
        if (name === "ServiceNotFound") return true;
        if (name === "ResourceInUse") return false;
        throw error;
      }
    }, DRAIN_WAIT_MS, `The app's DNS name ${instance} is still in use`);
  }

  private async waitUntil(done: () => Promise<boolean>, timeoutMs: number, failure: string): Promise<void> {
    const deadline = this.now() + timeoutMs;
    while (!(await done())) {
      if (this.now() >= deadline) throw new Error(failure);
      await this.sleep(POLL_MS);
    }
  }
}

function appContainer(task: Task) {
  return task.containers?.find((container) => container.name === "app");
}

function newest(tasks: Task[]): Task | undefined {
  const created = (task: Task) => new Date(task.createdAt ?? 0).getTime();
  return [...tasks].sort((a, b) => created(b) - created(a))[0];
}

function awsErrorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}
