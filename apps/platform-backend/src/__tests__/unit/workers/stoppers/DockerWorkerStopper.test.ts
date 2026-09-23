import {
  DockerWorkerStopper,
  type DockerContainerLookup,
} from "../../../../workers/stoppers/DockerWorkerStopper";

function dockerWith(stop: jest.Mock): { docker: DockerContainerLookup; getContainer: jest.Mock } {
  const getContainer = jest.fn(() => ({ stop }));
  return { docker: { getContainer }, getContainer };
}

function dockerError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`docker error ${statusCode}`), { statusCode });
}

describe("DockerWorkerStopper", () => {
  it("stops the job's container", async () => {
    const stop = jest.fn().mockResolvedValue(undefined);
    const { docker, getContainer } = dockerWith(stop);

    await expect(new DockerWorkerStopper(docker).stop("job-1")).resolves.toBe(true);

    expect(getContainer).toHaveBeenCalledWith("viberator-job-job-1");
    expect(stop).toHaveBeenCalled();
  });

  it("returns false when there is no container for the job", async () => {
    const { docker } = dockerWith(jest.fn().mockRejectedValue(dockerError(404)));

    await expect(new DockerWorkerStopper(docker).stop("job-1")).resolves.toBe(false);
  });

  it("returns false when the container has already stopped", async () => {
    const { docker } = dockerWith(jest.fn().mockRejectedValue(dockerError(304)));

    await expect(new DockerWorkerStopper(docker).stop("job-1")).resolves.toBe(false);
  });

  it("rethrows other Docker errors", async () => {
    const { docker } = dockerWith(jest.fn().mockRejectedValue(dockerError(500)));

    await expect(new DockerWorkerStopper(docker).stop("job-1")).rejects.toThrow("docker error 500");
  });
});
