import { execFileSync } from "child_process";

/** Whether the Docker worker container for a run is still running. */
export function isWorkerContainerRunning(jobId: string): boolean {
  const output = execFileSync(
    "docker",
    ["ps", "--quiet", "--filter", `name=^viberator-job-${jobId}$`],
    { encoding: "utf-8" },
  );
  return output.trim().length > 0;
}
