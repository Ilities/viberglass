import { ECSClient, StopTaskCommand } from "@aws-sdk/client-ecs";
import { JobWorkerDAO } from "../../persistence/job/JobWorkerDAO";
import type { WorkerStopper } from "../WorkerStopper";

/** A task ARN, `arn:aws:ecs:<region>:<account>:task/<cluster>/<task-id>`, names its cluster. */
export function clusterOfTaskArn(taskArn: string): string | null {
  const match = /:task\/([^/]+)\/[^/]+$/.exec(taskArn);
  return match ? match[1] : null;
}

/** Stops the ECS task EcsInvoker started for a job. */
export class EcsWorkerStopper implements WorkerStopper {
  readonly name = "EcsWorkerStopper";

  constructor(
    private readonly workers: Pick<JobWorkerDAO, "get"> = new JobWorkerDAO(),
    private readonly ecs: Pick<ECSClient, "send"> = new ECSClient({ region: process.env.AWS_REGION || "eu-west-1" }),
  ) {}

  async stop(jobId: string): Promise<boolean> {
    const worker = await this.workers.get(jobId);
    if (worker?.workerType !== "ecs") return false;
    const cluster = clusterOfTaskArn(worker.executionId);
    await this.ecs.send(
      new StopTaskCommand({ task: worker.executionId, ...(cluster ? { cluster } : {}), reason: "Cancelled in Viberglass" }),
    );
    return true;
  }
}
