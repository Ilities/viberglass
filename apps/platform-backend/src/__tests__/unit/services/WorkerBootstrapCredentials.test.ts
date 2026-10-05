import { WorkerBootstrapCredentials } from "../../../services/job/WorkerBootstrapCredentials";

describe("WorkerBootstrapCredentials", () => {
  it("resolves only the stored run's allowlist, deduplicating names", async () => {
    const resolveBindings = jest.fn().mockResolvedValue({ AGENT_KEY: "private-value", OTHER_KEY: "unlisted" });
    const service = new WorkerBootstrapCredentials({ resolveBindings });
    const payload = { credentialBindings: [{ envVar: "AGENT_KEY", secretId: "key-id" }], requiredCredentials: [{ envVar: "AGENT_KEY" }, { envVar: "AGENT_KEY" }] };
    await expect(service.resolve(payload)).resolves.toEqual({ AGENT_KEY: "private-value" });
    expect(resolveBindings).toHaveBeenCalledTimes(1);
    expect(resolveBindings).toHaveBeenCalledWith([{ envVar: "AGENT_KEY", secretId: "key-id" }]);
    expect(payload).not.toHaveProperty("credentials");
  });

  it("refuses a malformed allowlist before resolving any secrets", async () => {
    const resolveBindings = jest.fn();
    await expect(new WorkerBootstrapCredentials({ resolveBindings }).resolve({ requiredCredentials: [123] }))
      .rejects.toThrow("invalid credential allowlist");
    expect(resolveBindings).not.toHaveBeenCalled();
  });

  it("fails when a required credential no longer exists", async () => {
    const service = new WorkerBootstrapCredentials({ async resolveBindings() { return {}; } });
    await expect(service.resolve({ requiredCredentials: [{ envVar: "DELETED" }] })).rejects.toThrow("unavailable: DELETED");
  });

  it("allows a first Codex device login to start before an auth cache exists", async () => {
    const service = new WorkerBootstrapCredentials({ async resolveBindings() { return {}; } });
    await expect(service.resolve({ requiredCredentials: [{ envVar: "CODEX_AUTH" }], optionalCredentials: ["CODEX_AUTH"] }))
      .resolves.toEqual({});
  });
});
