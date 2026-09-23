import { nextClankerStatus } from "../../../services/clankerStatusTransition";

describe("nextClankerStatus", () => {
  const startFailed = {
    status: "failed" as const,
    statusMessage: "connect ENOENT /var/run/docker.sock",
  };

  it("keeps a failed start's real error when the runner is still unavailable", () => {
    expect(
      nextClankerStatus(startFailed, {
        status: "inactive",
        statusMessage: "Docker image not configured",
      }),
    ).toBeNull();
  });

  it("clears a failed start once the runner is available", () => {
    const available = { status: "active" as const, statusMessage: "Docker image ready" };

    expect(nextClankerStatus(startFailed, available)).toEqual(available);
  });

  it("leaves a deploying runner alone", () => {
    expect(
      nextClankerStatus(
        { status: "deploying", statusMessage: "Building image" },
        { status: "inactive", statusMessage: "Docker image not configured" },
      ),
    ).toBeNull();
  });

  it("applies a changed availability for runners that did not fail", () => {
    const available = { status: "active" as const, statusMessage: "Docker image ready" };

    expect(
      nextClankerStatus({ status: "inactive", statusMessage: "Docker image not configured" }, available),
    ).toEqual(available);
  });

  it("does nothing when the availability is unchanged", () => {
    const same = { status: "active" as const, statusMessage: "Docker image ready" };

    expect(nextClankerStatus(same, { ...same })).toBeNull();
  });
});
