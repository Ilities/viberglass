import type { ProvisioningStrategyHandler } from "../../../provisioning/ProvisioningStrategyHandler";
import { ClankerProvisioningOrchestrator } from "../../../provisioning/ClankerProvisioningOrchestrator";
import { ProvisioningStrategyResolver } from "../../../provisioning/ProvisioningStrategyResolver";
import type {
  AvailabilityResult,
  ProvisioningResult,
} from "../../../provisioning/types";
import { buildClanker } from "./testUtils";

describe("ClankerProvisioningOrchestrator", () => {
  function buildHandlerMocks() {
    const getPreflightError = jest.fn(() => null);
    const provisionResult: ProvisioningResult = {
      status: "active",
      statusMessage: "ok",
      deploymentConfig: { version: 1 },
    };
    const availabilityResult: AvailabilityResult = {
      status: "active",
      statusMessage: "ready",
    };
    const provision = jest.fn(async () => provisionResult);
    const deprovision = jest.fn(async () => ({
      status: "inactive" as const,
      statusMessage: "deprovisioned",
    }));
    const checkAvailability = jest.fn(async () => availabilityResult);

    const handler: ProvisioningStrategyHandler = {
      getPreflightError,
      provision,
      deprovision,
      checkAvailability,
    };

    return {
      handler,
      getPreflightError,
      provision,
      deprovision,
      checkAvailability,
    };
  }

  it("delegates preflight/provision/availability to the resolved handler", async () => {
    const docker = buildHandlerMocks();
    const ecs = buildHandlerMocks();
    const lambda = buildHandlerMocks();

    const orchestrator = new ClankerProvisioningOrchestrator(
      new ProvisioningStrategyResolver(),
      {
        docker: docker.handler,
        ecs: ecs.handler,
        lambda: lambda.handler,
      },
    );

    const clanker = buildClanker("docker", { type: "docker" });
    const preflightError = orchestrator.getProvisioningPreflightError(clanker);
    const provisionResult = await orchestrator.provision(clanker);
    const deprovisionResult = await orchestrator.deprovision(clanker);
    const availability = await orchestrator.resolveAvailabilityStatus(clanker);

    expect(preflightError).toBeNull();
    expect(provisionResult.status).toBe("active");
    expect(deprovisionResult.status).toBe("inactive");
    expect(availability.status).toBe("active");
    expect(docker.getPreflightError).toHaveBeenCalledWith(clanker);
    expect(docker.provision).toHaveBeenCalledWith(clanker, undefined);
    expect(docker.deprovision).toHaveBeenCalledWith(clanker);
    expect(docker.checkAvailability).toHaveBeenCalledWith(clanker);
    expect(ecs.provision).not.toHaveBeenCalled();
    expect(lambda.provision).not.toHaveBeenCalled();
  });

  it("returns consistent fallback for unsupported strategy", async () => {
    const docker = buildHandlerMocks();
    const ecs = buildHandlerMocks();
    const lambda = buildHandlerMocks();

    const orchestrator = new ClankerProvisioningOrchestrator(
      new ProvisioningStrategyResolver(),
      {
        docker: docker.handler,
        ecs: ecs.handler,
        lambda: lambda.handler,
      },
    );

    const clanker = buildClanker("kubernetes", { type: "docker" });
    const preflight = orchestrator.getProvisioningPreflightError(clanker);
    const provision = await orchestrator.provision(clanker);
    const deprovision = await orchestrator.deprovision(clanker);
    const availability = await orchestrator.resolveAvailabilityStatus(clanker);

    expect(preflight).toBe("Unsupported deployment strategy: kubernetes");
    expect(provision).toEqual({
      status: "inactive",
      statusMessage: "Unsupported deployment strategy: kubernetes",
    });
    expect(availability).toEqual({
      status: "inactive",
      statusMessage: "Unsupported deployment strategy: kubernetes",
    });
    expect(deprovision).toEqual({
      status: "inactive",
      statusMessage: "Unsupported deployment strategy: kubernetes",
    });
  });
});
