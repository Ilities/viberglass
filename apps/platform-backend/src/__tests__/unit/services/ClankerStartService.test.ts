import type { Clanker, ClankerStatus } from "@viberglass/types";
import { ClankerStartService } from "../../../services/ClankerStartService";
import { CLANKER_SERVICE_ERROR_CODE } from "../../../services/errors/ClankerServiceError";
import type { ProvisioningProgressReporter, ProvisioningResult } from "../../../provisioning/types";

jest.mock("../../../persistence/clanker/ClankerDAO", () => ({ ClankerDAO: jest.fn() }));
jest.mock("../../../provisioning/provisioningFactory", () => ({ getClankerProvisioner: jest.fn() }));

function clanker(status: ClankerStatus = "inactive"): Clanker {
  return {
    id: "clanker-1",
    name: "Default agent",
    slug: "default-agent",
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig: { version: 1 },
    configFiles: [],
    agent: "opencode",
    secretIds: [],
    status,
    statusMessage: null,
    createdAt: "",
    updatedAt: "",
  };
}

function build(provision: (c: Clanker, progress?: ProvisioningProgressReporter) => Promise<ProvisioningResult>) {
  const updateStatus = jest.fn(async (_id: string, status: ClankerStatus, _message?: string | null) =>
    clanker(status),
  );
  const updateClanker = jest.fn(async () => clanker("active"));
  const getProvisioningPreflightError = jest.fn((_c: Clanker): string | null => null);
  const service = new ClankerStartService(
    { updateStatus, updateClanker },
    { getProvisioningPreflightError, provision: jest.fn(provision) },
  );
  return { service, updateStatus, updateClanker, getProvisioningPreflightError };
}

describe("ClankerStartService", () => {
  it("marks the runner deploying, reports progress and records the result", async () => {
    const { service, updateStatus, updateClanker } = build(async (_c, progress) => {
      await progress?.("Pulling Docker image x: 1 of 2 layers");
      return { status: "active", statusMessage: "Docker image ready: x", deploymentConfig: { version: 1, ready: true } };
    });

    const { clanker: deploying, provisioning } = await service.start(clanker());
    await provisioning;

    expect(deploying.status).toBe("deploying");
    expect(updateStatus).toHaveBeenNthCalledWith(1, "clanker-1", "deploying", "Starting clanker...");
    expect(updateStatus).toHaveBeenNthCalledWith(2, "clanker-1", "deploying", "Pulling Docker image x: 1 of 2 layers");
    expect(updateClanker).toHaveBeenCalledWith("clanker-1", {
      deploymentConfig: { version: 1, ready: true },
      status: "active",
      statusMessage: "Docker image ready: x",
    });
  });

  it("records the real error when provisioning throws", async () => {
    const { service, updateStatus } = build(async () => {
      throw new Error("Docker image x isn't available locally and couldn't be pulled: denied");
    });

    const { provisioning } = await service.start(clanker());
    await provisioning;

    expect(updateStatus).toHaveBeenLastCalledWith(
      "clanker-1",
      "failed",
      "Docker image x isn't available locally and couldn't be pulled: denied",
    );
  });

  it.each([
    ["active" as const, CLANKER_SERVICE_ERROR_CODE.ALREADY_ACTIVE],
    ["deploying" as const, CLANKER_SERVICE_ERROR_CODE.ALREADY_DEPLOYING],
  ])("refuses a runner that's already %s", async (status, code) => {
    const { service, updateStatus } = build(async () => ({ status: "active" }));

    await expect(service.start(clanker(status))).rejects.toMatchObject({ code });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("refuses a runner that can't be provisioned as configured", async () => {
    const { service, getProvisioningPreflightError, updateStatus } = build(async () => ({ status: "active" }));
    getProvisioningPreflightError.mockReturnValue("ECS pre-built mode requires taskDefinitionArn.");

    await expect(service.start(clanker())).rejects.toMatchObject({
      code: CLANKER_SERVICE_ERROR_CODE.PROVISIONING_CONFIG_ERROR,
      message: "ECS pre-built mode requires taskDefinitionArn.",
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
