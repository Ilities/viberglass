import { KubernetesRunSecret, kubernetesRunSecretName } from "../../../../workers/invokers/KubernetesRunSecret";

function setup() {
  const client = { createNamespacedSecret: jest.fn().mockResolvedValue({}), readNamespacedSecret: jest.fn(),
    deleteNamespacedSecret: jest.fn().mockResolvedValue({}) };
  return { client, secrets: new KubernetesRunSecret(async () => client) };
}

it("creates an immutable per-run token and attaches it to Job cleanup", async () => {
  const { client, secrets } = setup();
  await secrets.ensure("workers", "run", "private-token", { metadata: { name: "job-name", uid: "job-uid" } });
  expect(client.createNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
    immutable: true, stringData: { token: "private-token" }, metadata: expect.objectContaining({ name: kubernetesRunSecretName("run") }),
  }) }));
  expect(client.createNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
    metadata: expect.objectContaining({ ownerReferences: [expect.objectContaining({ uid: "job-uid" })] }),
  }) }));
});

it("reuses only a Secret with the same run binding and token", async () => {
  const { client, secrets } = setup();
  client.createNamespacedSecret.mockRejectedValue({ code: 409 });
  client.readNamespacedSecret.mockResolvedValue({ metadata: { annotations: { "viberglass.dev/job-id": "run" }, ownerReferences: [{ apiVersion: "batch/v1", kind: "Job", name: "job", uid: "uid" }] },
    data: { token: Buffer.from("token").toString("base64") } });
  await secrets.ensure("workers", "run", "token", { metadata: { name: "job", uid: "uid" } });
  await expect(secrets.ensure("workers", "run", "wrong-token", { metadata: { name: "job", uid: "uid" } })).rejects.toThrow("does not belong");
  expect(client.deleteNamespacedSecret).not.toHaveBeenCalled();
});

it("does not overwrite a Secret from another run", async () => {
  const { client, secrets } = setup();
  client.createNamespacedSecret.mockRejectedValue({ code: 409 });
  client.readNamespacedSecret.mockResolvedValue({ metadata: { annotations: { "viberglass.dev/job-id": "other" } },
    data: { token: Buffer.from("token").toString("base64") } });
  await expect(secrets.ensure("workers", "run", "token", { metadata: { name: "job", uid: "uid" } })).rejects.toThrow("does not belong");
});

it("ignores already-deleted Secrets and reports real cleanup errors", async () => {
  const { client, secrets } = setup();
  client.deleteNamespacedSecret.mockRejectedValueOnce({ code: 404 }).mockRejectedValueOnce(new Error("Forbidden"));
  await secrets.remove("workers", "run");
  await expect(secrets.remove("workers", "run")).rejects.toThrow("Forbidden");
});
