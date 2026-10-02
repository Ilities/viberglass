import { WorkerBootstrapCredentials } from "../../../services/job/WorkerBootstrapCredentials";

describe("WorkerBootstrapCredentials", () => {
  it("resolves only the stored run's allowlist, deduplicating names", async () => {
    const resolveNamedSecret = jest.fn().mockResolvedValue("private-value");
    const service = new WorkerBootstrapCredentials({ resolveNamedSecret });
    const payload = { requiredCredentials: ["AGENT_KEY", "AGENT_KEY"] };
    await expect(service.resolve(payload)).resolves.toEqual({ AGENT_KEY: "private-value" });
    expect(resolveNamedSecret).toHaveBeenCalledTimes(1);
    expect(resolveNamedSecret).toHaveBeenCalledWith("AGENT_KEY");
    expect(payload).not.toHaveProperty("credentials");
  });

  it("refuses a malformed allowlist before resolving any secrets", async () => {
    const resolveNamedSecret = jest.fn();
    await expect(new WorkerBootstrapCredentials({ resolveNamedSecret }).resolve({ requiredCredentials: [123] }))
      .rejects.toThrow("invalid credential allowlist");
    expect(resolveNamedSecret).not.toHaveBeenCalled();
  });

  it("fails when a required credential no longer exists", async () => {
    const service = new WorkerBootstrapCredentials({ async resolveNamedSecret() { return undefined; } });
    await expect(service.resolve({ requiredCredentials: ["DELETED"] })).rejects.toThrow("unavailable: DELETED");
  });

  it("allows a first Codex device login to start before an auth cache exists", async () => {
    const service = new WorkerBootstrapCredentials({ async resolveNamedSecret() { return undefined; } });
    await expect(service.resolve({ requiredCredentials: ["CODEX_AUTH"], optionalCredentials: ["CODEX_AUTH"] }))
      .resolves.toEqual({});
  });
});
