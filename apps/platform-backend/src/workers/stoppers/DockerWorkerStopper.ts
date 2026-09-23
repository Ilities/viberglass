import Docker from "dockerode";
import type { WorkerStopper } from "../WorkerStopper";
import { dockerJobContainerName } from "../invokers/dockerJobContainerName";

const NOT_FOUND = 404;
const NOT_MODIFIED = 304;

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error;
    return typeof statusCode === "number" ? statusCode : undefined;
  }
  return undefined;
}

/** The part of the Docker API this stopper needs. */
export interface DockerContainerLookup {
  getContainer(id: string): { stop(): Promise<unknown> };
}

/** Stops the container that DockerInvoker started for a job. */
export class DockerWorkerStopper implements WorkerStopper {
  readonly name = "DockerWorkerStopper";

  constructor(
    private readonly docker: DockerContainerLookup = new Docker({
      socketPath: "/var/run/docker.sock",
    }),
  ) {}

  async stop(jobId: string): Promise<boolean> {
    try {
      await this.docker.getContainer(dockerJobContainerName(jobId)).stop();
      return true;
    } catch (error) {
      const statusCode = statusCodeOf(error);
      // No such container (not a Docker job, or already removed) or already stopped.
      if (statusCode === NOT_FOUND || statusCode === NOT_MODIFIED) {
        return false;
      }
      throw error;
    }
  }
}
