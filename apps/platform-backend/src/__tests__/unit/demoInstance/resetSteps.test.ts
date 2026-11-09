import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { APP_RESOURCE_SELECTOR, AppResourceCleanup } from "../../../demo/reset/AppResourceCleanup";
import { BackendScale } from "../../../demo/reset/BackendScale";
import { BucketWipe } from "../../../demo/reset/BucketWipe";

describe("BackendScale", () => {
  it("scales to zero and waits until no pod is left", async () => {
    const statuses = [3, 1, 0];
    const api = {
      readNamespacedDeploymentScale: jest.fn(async () => ({ spec: { replicas: 1 }, status: { replicas: statuses.shift() ?? 0 } })),
      replaceNamespacedDeploymentScale: jest.fn(async () => ({})),
    };
    const sleep = jest.fn(async () => {});
    await new BackendScale(api as never, "viberglass", "viberglass-backend", sleep).scaleTo(0);

    expect(api.replaceNamespacedDeploymentScale).toHaveBeenCalledWith(
      expect.objectContaining({ name: "viberglass-backend", namespace: "viberglass", body: expect.objectContaining({ spec: { replicas: 0 } }) }),
    );
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("doesn't wait when scaling back up", async () => {
    const api = { readNamespacedDeploymentScale: jest.fn(async () => ({ spec: { replicas: 0 } })), replaceNamespacedDeploymentScale: jest.fn(async () => ({})) };
    await new BackendScale(api as never, "ns", "backend", async () => {}).scaleTo(1);
    expect(api.readNamespacedDeploymentScale).toHaveBeenCalledTimes(1);
  });
});

describe("AppResourceCleanup", () => {
  it("removes only platform-labelled app resources, Secrets and volumes by collection", async () => {
    const apps = { deleteCollectionNamespacedDeployment: jest.fn(async () => ({})) };
    const core = {
      listNamespacedService: jest.fn(async () => ({ items: [{ metadata: { name: "app-a" } }, { metadata: {} }] })),
      deleteNamespacedService: jest.fn(async () => ({})),
      deleteCollectionNamespacedSecret: jest.fn(async () => ({})),
      deleteCollectionNamespacedPersistentVolumeClaim: jest.fn(async () => ({})),
    };
    await new AppResourceCleanup(apps as never, core as never, "apps").run();

    const scope = { namespace: "apps", labelSelector: APP_RESOURCE_SELECTOR };
    expect(apps.deleteCollectionNamespacedDeployment).toHaveBeenCalledWith({ ...scope, propagationPolicy: "Background" });
    expect(core.listNamespacedService).toHaveBeenCalledWith(scope);
    expect(core.deleteNamespacedService).toHaveBeenCalledTimes(1);
    expect(core.deleteNamespacedService).toHaveBeenCalledWith({ namespace: "apps", name: "app-a" });
    expect(core.deleteCollectionNamespacedSecret).toHaveBeenCalledWith(scope);
    expect(core.deleteCollectionNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(scope);
  });
});

describe("BucketWipe", () => {
  it("deletes page after page until the bucket is empty", async () => {
    const pages = [["a", "b"], ["c"], []];
    const deleted: string[] = [];
    const s3 = {
      send: jest.fn(async (command: unknown) => {
        if (command instanceof ListObjectsV2Command) return { Contents: (pages.shift() ?? []).map((Key) => ({ Key })) };
        if (command instanceof DeleteObjectsCommand) deleted.push(...(command.input.Delete?.Objects ?? []).map((object) => object.Key ?? ""));
        return {};
      }),
    };
    expect(await new BucketWipe(s3, "viberglass").run()).toBe(3);
    expect(deleted).toEqual(["a", "b", "c"]);
  });
});
