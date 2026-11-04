import type { RegisterTaskDefinitionCommandInput, Service, Task } from "@aws-sdk/client-ecs";
import { EcsAppHost, type EcsAppClient, type EcsAppHostOptions } from "../../../../services/apps/EcsAppHost";

const SPEC = {
  instance: "app-space-1",
  projectId: "space-1",
  image: "ghcr.io/ilities/viberglass-app-runtime-node:latest",
  env: { VIBERGLASS_BUNDLE_KEY: "spaces/space-1/releases/r1/bundle.tar.gz", VIBERGLASS_DATA_BUCKET: "uploads" },
};
const OPTIONS: EcsAppHostOptions = {
  region: "eu-west-1",
  prefix: "dev-viberglass",
  cluster: "apps-cluster",
  subnetIds: ["subnet-a", "subnet-b"],
  securityGroupId: "sg-apps",
  assignPublicIp: false,
  executionRoleArn: "arn:aws:iam::123456789012:role/apps-exec",
  logGroup: "/ecs/viberglass-dev-apps",
  namespace: { id: "ns-1", name: "apps.dev.viberglass.internal" },
  rolePath: "/viberglass/dev/apps/",
  permissionsBoundaryArn: "arn:aws:iam::123456789012:policy/viberglass-dev-app-boundary",
  bucket: "uploads",
  size: { cpu: "256", memory: "512" },
};
const SERVICE = "dev-viberglass-app-space-1";

function awsError(name: string) {
  return Object.assign(new Error(name), { name });
}

function task(fields: Partial<Task>): Task {
  return { taskArn: "arn:aws:ecs:eu-west-1:123456789012:task/apps-cluster/t1", createdAt: new Date(1000), ...fields };
}

function build() {
  let service: Service | null = null;
  let tasks: Task[] = [];
  const client = {
    ecs: {
      registerTaskDefinition: jest.fn(async () => ({ taskDefinition: { taskDefinitionArn: `${SERVICE}:2` } })),
      deregisterTaskDefinition: jest.fn(async () => ({})),
      listTaskDefinitions: jest.fn(async () => ({ taskDefinitionArns: [`arn:aws:ecs:eu-west-1:1:task-definition/${SERVICE}:2`, `arn:aws:ecs:eu-west-1:1:task-definition/${SERVICE}-other:1`] })),
      createService: jest.fn(async () => ({})),
      updateService: jest.fn(async () => ({})),
      deleteService: jest.fn(async () => ({})),
      describeServices: jest.fn(async () => ({ services: service ? [service] : [] })),
      listTasks: jest.fn(async ({ desiredStatus }: { desiredStatus: string }) => ({
        taskArns: tasks.filter((t) => t.desiredStatus === desiredStatus).map((t) => t.taskArn!),
      })),
      describeTasks: jest.fn(async ({ tasks: arns }: { tasks: string[] }) => ({ tasks: tasks.filter((t) => arns.includes(t.taskArn!)) })),
    },
    discovery: {
      createService: jest.fn(async () => ({ Service: { Id: "srv-1", Arn: "arn:aws:servicediscovery:eu-west-1:1:service/srv-1" } })),
      listServices: jest.fn(async () => ({ Services: [] as { Id: string; Name: string }[] })),
      getService: jest.fn(async () => ({ Service: { Arn: "arn:aws:servicediscovery:eu-west-1:1:service/srv-old" } })),
      deleteService: jest.fn(async () => ({})),
    },
    iam: {
      getRole: jest.fn(async (): Promise<{ Role?: { Arn: string } }> => {
        throw awsError("NoSuchEntityException");
      }),
      createRole: jest.fn(async () => ({ Role: { Arn: "arn:aws:iam::123456789012:role/viberglass/dev/apps/dev-viberglass-app-space-1" } })),
      putRolePolicy: jest.fn(async () => ({})),
    },
    logs: { getLogEvents: jest.fn(async () => ({ events: [{ message: "listening" }, { message: "on 3000" }] })) },
  };
  let clock = 0;
  const sleep = jest.fn(async (ms: number) => void (clock += ms));
  const host = new EcsAppHost(OPTIONS, async () => client as unknown as EcsAppClient, sleep, () => clock);
  return {
    host,
    client,
    sleep,
    setService: (next: Service | null) => void (service = next),
    setTasks: (next: Task[]) => void (tasks = next),
  };
}

function registered(client: ReturnType<typeof build>["client"]): RegisterTaskDefinitionCommandInput {
  return (client.ecs.registerTaskDefinition.mock.calls as unknown as [RegisterTaskDefinitionCommandInput][])[0][0];
}

describe("EcsAppHost", () => {
  it("creates a stopped service with its own role, DNS name and task definition", async () => {
    const { host, client, sleep } = build();

    await host.create(SPEC);

    expect(client.iam.createRole).toHaveBeenCalledWith(expect.objectContaining({
      RoleName: "dev-viberglass-app-space-1",
      Path: "/viberglass/dev/apps/",
      PermissionsBoundary: OPTIONS.permissionsBoundaryArn,
    }));
    const trust = JSON.parse((client.iam.createRole.mock.calls as unknown as [{ AssumeRolePolicyDocument: string }][])[0][0].AssumeRolePolicyDocument);
    expect(trust.Statement[0].Condition).toEqual({ StringEquals: { "aws:SourceAccount": "123456789012" } });
    const policy = JSON.parse((client.iam.putRolePolicy.mock.calls as unknown as [{ PolicyDocument: string }][])[0][0].PolicyDocument);
    expect(policy.Statement.map((s: { Action: string[]; Resource: string[] }) => [s.Action, s.Resource])).toEqual([
      [["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], ["arn:aws:s3:::uploads/spaces/space-1/app-data/*"]],
      [["s3:ListBucket"], ["arn:aws:s3:::uploads"]],
      [["s3:GetObject"], ["arn:aws:s3:::uploads/spaces/space-1/releases/*"]],
    ]);
    // A role created a moment ago may not be usable by ECS yet.
    expect(sleep).toHaveBeenCalledWith(10_000);

    expect(client.discovery.createService).toHaveBeenCalledWith(expect.objectContaining({ Name: "app-space-1", NamespaceId: "ns-1" }));

    const definition = registered(client);
    expect(definition).toMatchObject({ family: SERVICE, cpu: "256", memory: "512", taskRoleArn: expect.stringContaining("dev-viberglass-app-space-1") });
    const [init, app] = definition.containerDefinitions!;
    expect(init).toMatchObject({ essential: false, user: "0", command: ["chown 1000:1000 /data /app /tmp"] });
    expect(app).toMatchObject({
      user: "1000:1000",
      readonlyRootFilesystem: true,
      stopTimeout: 30,
      linuxParameters: { capabilities: { drop: ["ALL"] } },
      dependsOn: [{ containerName: "volumes", condition: "SUCCESS" }],
    });
    expect(app.environment).toEqual(expect.arrayContaining([
      { name: "VIBERGLASS_BUNDLE_KEY", value: SPEC.env.VIBERGLASS_BUNDLE_KEY },
      { name: "PORT", value: "3000" },
      { name: "HOME", value: "/tmp" },
    ]));
    expect(app.mountPoints?.map((m) => m.containerPath)).toEqual(["/data", "/app", "/tmp"]);

    expect(client.ecs.createService).toHaveBeenCalledWith(expect.objectContaining({
      serviceName: SERVICE,
      desiredCount: 0,
      deploymentConfiguration: { minimumHealthyPercent: 0, maximumPercent: 100 },
      networkConfiguration: { awsvpcConfiguration: { subnets: ["subnet-a", "subnet-b"], securityGroups: ["sg-apps"], assignPublicIp: "DISABLED" } },
      serviceRegistries: [{ registryArn: "arn:aws:servicediscovery:eu-west-1:1:service/srv-1" }],
    }));
  });

  it("gives previews their space's read-only role", async () => {
    const { host, client } = build();

    await host.create({ ...SPEC, instance: "preview-abc" });

    expect(client.iam.createRole).toHaveBeenCalledWith(expect.objectContaining({ RoleName: "dev-viberglass-preview-space-1" }));
    const policy = JSON.parse((client.iam.putRolePolicy.mock.calls as unknown as [{ PolicyDocument: string }][])[0][0].PolicyDocument);
    expect(policy.Statement[0].Action).toEqual(["s3:GetObject"]);
    expect(registered(client).family).toBe("dev-viberglass-preview-abc");
  });

  it("replaces an existing service's release after stopping it, and drops the old task definition", async () => {
    const { host, client, setService, setTasks } = build();
    client.iam.getRole.mockResolvedValue({ Role: { Arn: "arn:aws:iam::123456789012:role/existing" } });
    client.discovery.listServices.mockResolvedValue({ Services: [{ Id: "srv-old", Name: "app-space-1" }] });
    setService({ status: "ACTIVE", desiredCount: 1, taskDefinition: `${SERVICE}:1` });
    setTasks([task({ desiredStatus: "RUNNING", lastStatus: "RUNNING" })]);
    client.ecs.updateService.mockImplementationOnce(async () => {
      setService({ status: "ACTIVE", desiredCount: 0, taskDefinition: `${SERVICE}:1` });
      setTasks([task({ desiredStatus: "STOPPED", lastStatus: "STOPPED" })]);
      return {};
    });

    await host.create(SPEC);

    expect(client.ecs.updateService.mock.calls).toEqual([
      [{ cluster: "apps-cluster", service: SERVICE, desiredCount: 0 }],
      [{ cluster: "apps-cluster", service: SERVICE, taskDefinition: `${SERVICE}:2`, desiredCount: 0 }],
    ]);
    expect(client.ecs.deregisterTaskDefinition).toHaveBeenCalledWith({ taskDefinition: `${SERVICE}:1` });
    expect(client.ecs.createService).not.toHaveBeenCalled();
    expect(client.iam.createRole).not.toHaveBeenCalled();
    expect(client.discovery.createService).not.toHaveBeenCalled();
  });

  it("waits for a deleted service to drain before creating it again", async () => {
    const { host, client, setService } = build();
    setService({ status: "DRAINING" });
    let checks = 0;
    client.ecs.describeServices.mockImplementation(async () => {
      checks += 1;
      return { services: [{ status: checks > 3 ? "INACTIVE" : "DRAINING" }] };
    });

    await host.create(SPEC);

    expect(client.ecs.createService).toHaveBeenCalled();
  });

  it("starts and stops by setting the task count, waiting until the task has stopped", async () => {
    const { host, client, setService, setTasks } = build();
    setService({ status: "ACTIVE", desiredCount: 1 });
    setTasks([task({ desiredStatus: "STOPPED", lastStatus: "DEPROVISIONING" })]);
    client.ecs.updateService.mockImplementation(async () => ({}));
    let polls = 0;
    client.ecs.describeTasks.mockImplementation(async () => {
      polls += 1;
      return { tasks: [task({ desiredStatus: "STOPPED", lastStatus: polls > 2 ? "STOPPED" : "DEPROVISIONING" })] };
    });

    await host.start(SPEC.instance);
    await host.stop(SPEC.instance, 30);

    expect(client.ecs.updateService.mock.calls).toEqual([
      [{ cluster: "apps-cluster", service: SERVICE, desiredCount: 1 }],
      [{ cluster: "apps-cluster", service: SERVICE, desiredCount: 0 }],
    ]);
    expect(polls).toBe(3);
  });

  it("reports what the service's tasks are doing", async () => {
    const { host, setService, setTasks } = build();
    const current = `${SERVICE}:2`;

    expect(await host.status(SPEC.instance)).toEqual({ state: "missing" });
    setService({ status: "ACTIVE", desiredCount: 0, taskDefinition: current });
    expect(await host.status(SPEC.instance)).toEqual({ state: "stopped" });

    setService({ status: "ACTIVE", desiredCount: 1, taskDefinition: current });
    setTasks([task({ desiredStatus: "RUNNING", lastStatus: "PROVISIONING" })]);
    expect(await host.status(SPEC.instance)).toEqual({ state: "starting" });
    setTasks([task({ desiredStatus: "RUNNING", lastStatus: "RUNNING", containers: [{ name: "app", lastStatus: "RUNNING" }] })]);
    expect(await host.status(SPEC.instance)).toEqual({ state: "running" });

    setTasks([task({ desiredStatus: "STOPPED", lastStatus: "STOPPED", taskDefinitionArn: current, stopCode: "TaskFailedToStart", stoppedReason: "CannotPullContainerError: pull access denied" })]);
    expect(await host.status(SPEC.instance)).toEqual({ state: "stopped", detail: "The app couldn't start: CannotPullContainerError: pull access denied" });

    setTasks([task({ desiredStatus: "STOPPED", lastStatus: "STOPPED", taskDefinitionArn: current, stopCode: "EssentialContainerExited", containers: [{ name: "app", exitCode: 1 }] })]);
    expect(await host.status(SPEC.instance)).toEqual({ state: "restarting", detail: "The app stopped with exit code 1" });

    // A failure of the release before says nothing about this one.
    setTasks([task({ desiredStatus: "STOPPED", lastStatus: "STOPPED", taskDefinitionArn: `${SERVICE}:1`, stopCode: "TaskFailedToStart", stoppedReason: "CannotPullContainerError" })]);
    expect(await host.status(SPEC.instance)).toEqual({ state: "starting" });
  });

  it("is reached through its Cloud Map name", () => {
    const { host } = build();
    expect(host.address("preview-abc")).toBe("http://preview-abc.apps.dev.viberglass.internal:3000");
  });

  it("has no logs for an app whose service doesn't exist", async () => {
    const { host, client } = build();
    client.ecs.listTasks.mockRejectedValue(awsError("ServiceNotFoundException"));
    expect(await host.logs(SPEC.instance, 20)).toBe("");
  });

  it("reads the newest task's log stream", async () => {
    const { host, client, setTasks } = build();
    expect(await host.logs(SPEC.instance, 20)).toBe("");

    setTasks([
      task({ taskArn: "arn:aws:ecs:eu-west-1:1:task/apps-cluster/old", createdAt: new Date(1000), desiredStatus: "STOPPED" }),
      task({ taskArn: "arn:aws:ecs:eu-west-1:1:task/apps-cluster/new", createdAt: new Date(2000), desiredStatus: "RUNNING" }),
    ]);
    expect(await host.logs(SPEC.instance, 20)).toBe("listening\non 3000");
    expect(client.logs.getLogEvents).toHaveBeenCalledWith({ logGroupName: OPTIONS.logGroup, logStreamName: "app-space-1/app/new", limit: 20, startFromHead: false });

    client.logs.getLogEvents.mockRejectedValueOnce(awsError("ResourceNotFoundException"));
    expect(await host.logs(SPEC.instance, 20)).toBe("");
  });

  it("deletes the service, then its DNS name once ECS lets go of it, then its task definitions", async () => {
    const { host, client, setService } = build();
    setService({ status: "ACTIVE", desiredCount: 0 });
    client.ecs.deleteService.mockImplementation(async () => {
      setService({ status: "INACTIVE" });
      return {};
    });
    client.discovery.listServices.mockResolvedValue({ Services: [{ Id: "srv-old", Name: "app-space-1" }] });
    client.discovery.deleteService.mockRejectedValueOnce(awsError("ResourceInUse"));

    await host.delete(SPEC.instance);

    expect(client.ecs.deleteService).toHaveBeenCalledWith({ cluster: "apps-cluster", service: SERVICE, force: true });
    expect(client.discovery.deleteService).toHaveBeenCalledTimes(2);
    expect(client.ecs.deregisterTaskDefinition.mock.calls).toEqual([[{ taskDefinition: `arn:aws:ecs:eu-west-1:1:task-definition/${SERVICE}:2` }]]);
  });

  it("has no local data to clear", async () => {
    const { host, client } = build();
    await host.clearData();
    expect(client.ecs.updateService).not.toHaveBeenCalled();
  });
});
