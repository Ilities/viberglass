import type { DockerClientPort } from "../../../provisioning/ports/DockerClientPort";
import { DockerImagePuller } from "../../../provisioning/strategies/DockerImagePuller";

const missingImage = { statusCode: 404, message: "No such image" };

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A Docker host whose pulls finish when the test says so, and which has an image once it's pulled. */
function slowDocker() {
  const present = new Set<string>();
  const pulls = new Map<string, ReturnType<typeof deferred>>();
  const started: string[] = [];
  const client: DockerClientPort = {
    buildImage: jest.fn(),
    inspectImage: jest.fn(async (image: string) => {
      if (!present.has(image)) throw missingImage;
      return { Id: image };
    }),
    pullImage: jest.fn(async ({ image }: { image: string }) => {
      started.push(image);
      const pull = deferred();
      pulls.set(image, pull);
      await pull.promise;
      present.add(image);
    }),
  };
  const finish = (image: string) => pulls.get(image)?.resolve();
  const fail = (image: string) => pulls.get(image)?.reject(new Error("no space left on device"));
  return { client, started, finish, fail };
}

describe("DockerImagePuller", () => {
  it("pulls one image at a time", async () => {
    const docker = slowDocker();
    const puller = new DockerImagePuller(docker.client);

    const first = puller.ensurePresent("worker-a:1");
    const second = puller.ensurePresent("worker-b:1");
    await flush();
    expect(docker.started).toEqual(["worker-a:1"]);

    docker.finish("worker-a:1");
    await first;
    await flush();
    expect(docker.started).toEqual(["worker-a:1", "worker-b:1"]);

    docker.finish("worker-b:1");
    await second;
  });

  it("pulls an image once when two runners start on it together", async () => {
    const docker = slowDocker();
    const puller = new DockerImagePuller(docker.client);

    const first = puller.ensurePresent("worker:1");
    const second = puller.ensurePresent("worker:1");
    await flush();
    docker.finish("worker:1");
    await Promise.all([first, second]);

    expect(docker.started).toEqual(["worker:1"]);
  });

  it("tells a waiting runner it is queued", async () => {
    const docker = slowDocker();
    const puller = new DockerImagePuller(docker.client);
    const progress = jest.fn();

    const first = puller.ensurePresent("worker-a:1");
    const second = puller.ensurePresent("worker-b:1", progress);
    await flush();
    docker.finish("worker-a:1");
    await first;
    await flush();
    docker.finish("worker-b:1");
    await second;

    expect(progress.mock.calls[0]).toEqual(["Waiting for another Docker image pull to finish before worker-b:1"]);
  });

  it("goes on with the next pull after one fails", async () => {
    const docker = slowDocker();
    const puller = new DockerImagePuller(docker.client);

    const first = puller.ensurePresent("worker-a:1");
    const second = puller.ensurePresent("worker-b:1");
    await flush();
    docker.fail("worker-a:1");
    await expect(first).rejects.toThrow("no space left on device");
    await flush();
    docker.finish("worker-b:1");
    await second;

    expect(docker.started).toEqual(["worker-a:1", "worker-b:1"]);
  });
});
