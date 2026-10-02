import { StopTaskCommand } from "@aws-sdk/client-ecs";
import { clusterOfTaskArn, EcsWorkerStopper } from "../../../../workers/stoppers/EcsWorkerStopper";

const TASK_ARN = "arn:aws:ecs:eu-west-1:123456789012:task/viberator-workers/0123456789abcdef";

describe("EcsWorkerStopper", () => {
  it("stops the ECS task the job runs in, in its cluster", async () => {
    const ecs = { send: jest.fn().mockResolvedValue({}) };
    const workers = { get: jest.fn().mockResolvedValue({ workerType: "ecs", executionId: TASK_ARN }) };

    await expect(new EcsWorkerStopper(workers, ecs).stop("job-1")).resolves.toBe(true);

    const [command] = ecs.send.mock.calls[0];
    expect(command).toBeInstanceOf(StopTaskCommand);
    expect(command.input).toEqual({ task: TASK_ARN, cluster: "viberator-workers", reason: "Cancelled in Viberglass" });
  });

  it("leaves jobs on other workers to their stoppers", async () => {
    const ecs = { send: jest.fn() };
    for (const worker of [{ workerType: "docker", executionId: "viberator-job-1" }, { workerType: "lambda", executionId: "req-1" }, null]) {
      await expect(new EcsWorkerStopper({ get: jest.fn().mockResolvedValue(worker) }, ecs).stop("job-1")).resolves.toBe(false);
    }
    expect(ecs.send).not.toHaveBeenCalled();
  });

  it("reads the cluster from a task ARN", () => {
    expect(clusterOfTaskArn(TASK_ARN)).toBe("viberator-workers");
    expect(clusterOfTaskArn("arn:aws:ecs:eu-west-1:123456789012:task/0123456789abcdef")).toBeNull();
  });
});
