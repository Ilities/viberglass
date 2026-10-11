import type { V1Pod, CoreV1Event } from "@kubernetes/client-node";
import { KubernetesPodInspector } from "../../../../workers/invokers/KubernetesPodInspector";

async function inspect(pods: V1Pod[], events: CoreV1Event[] = []) {
  const client = { listNamespacedPod: jest.fn().mockResolvedValue({ items: pods }),
    listNamespacedEvent: jest.fn().mockResolvedValue({ items: events }) };
  const result = await new KubernetesPodInspector(async () => client).inspect("workers", { metadata: { name: "run-job", uid: "job-uid" } });
  return { client, result };
}

it("reports an image pull failure from Pod state", async () => {
  const { result } = await inspect([{ metadata: { name: "worker", uid: "pod-uid" }, status: { phase: "Pending", containerStatuses: [{
    name: "worker", image: "missing:tag", imageID: "", ready: false, restartCount: 0,
    state: { waiting: { reason: "ImagePullBackOff", message: "manifest unknown" } },
  }] } }]);
  expect(result.startupFailure).toContain("ImagePullBackOff: manifest unknown");
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ level: "warn", message: expect.stringContaining("ImagePullBackOff") })]));
});

it("reports scheduling failures and reads only this Job's events", async () => {
  const { result, client } = await inspect([{ metadata: { name: "worker", uid: "pod-uid" }, status: { conditions: [{
    type: "PodScheduled", status: "False", reason: "Unschedulable", message: "Insufficient memory",
  }] } }]);
  expect(result.startupFailure).toContain("Insufficient memory");
  expect(client.listNamespacedPod).toHaveBeenCalledWith({ namespace: "workers", labelSelector: "job-name=run-job" });
  expect(client.listNamespacedEvent).toHaveBeenCalledWith({ namespace: "workers", fieldSelector: "involvedObject.uid=pod-uid" });
});

it("reports quota/admission failures when the Job cannot create a Pod", async () => {
  const { result } = await inspect([], [{ metadata: {}, involvedObject: { uid: "job-uid" }, type: "Warning", reason: "FailedCreate", message: "exceeded quota" }]);
  expect(result.startupFailure).toContain("exceeded quota");
});

it("keeps historical admission warnings without failing a recovered running Pod", async () => {
  const { result } = await inspect([{ status: { phase: "Running" } }], [{
    metadata: {}, involvedObject: { uid: "job-uid" }, type: "Warning", reason: "FailedCreate", message: "exceeded quota",
  }]);
  expect(result.startupFailure).toBeUndefined();
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ message: expect.stringContaining("exceeded quota") }));
});

it("retains termination details instead of a generic Job failure", async () => {
  const { result } = await inspect([{ metadata: { name: "worker" }, status: { phase: "Failed", containerStatuses: [{
    name: "worker", image: "worker:tag", imageID: "id", ready: false, restartCount: 0,
    state: { terminated: { exitCode: 137, reason: "OOMKilled" } },
  }] } }]);
  expect(result.startupFailure).toContain("OOMKilled (exit 137)");
});

it("allows running Pods and ordinary image downloads to continue", async () => {
  const { result } = await inspect([{ status: { phase: "Running" } }, { status: { phase: "Pending", containerStatuses: [{
    name: "worker", image: "worker:tag", imageID: "", ready: false, restartCount: 0,
    state: { waiting: { reason: "ContainerCreating" } },
  }] } }]);
  expect(result.startupFailure).toBeUndefined();
});
