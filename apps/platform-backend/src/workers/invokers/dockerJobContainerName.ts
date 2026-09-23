/** Name of the container DockerInvoker creates for a job. */
export function dockerJobContainerName(jobId: string): string {
  return `viberator-job-${jobId}`;
}
