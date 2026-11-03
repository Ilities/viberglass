import type { AppRelease, JobStatus } from "@viberglass/types";
import type { ReleaseOutcome } from "../../../../persistence/apps/AppReleaseDAO";
import { ReleaseCallbackDenied, ReleaseCallbackService } from "../../../../services/apps/ReleaseCallbackService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const RELEASE: AppRelease = {
  id: "release-1",
  projectId: "project-1",
  commitSha: "d".repeat(40),
  status: "building",
  jobId: "build_1",
  bundleSha256: null,
  bundleBytes: null,
  nodeVersion: null,
  buildLog: null,
  failureReason: null,
  createdAt: "",
  finishedAt: null,
};

function build(options: { status?: JobStatus; tenantId?: string; release?: AppRelease | null; finished?: boolean } = {}) {
  const deps = {
    releases: {
      getByJobId: jest.fn(async () => (options.release === undefined ? RELEASE : options.release)),
      finish: jest.fn(async (_releaseId: string, _outcome: ReleaseOutcome) => options.finished ?? true),
    },
    bootstraps: { getBootstrapPayload: jest.fn(async () => ({ tenantId: options.tenantId ?? "api-server", status: options.status ?? "active", payload: {} })) },
    store: { bucket: jest.fn(() => "uploads"), sign: jest.fn(async () => "https://storage.example/signed") },
  };
  return { service: new ReleaseCallbackService(deps.releases, deps.bootstraps, deps.store), deps };
}

describe("ReleaseCallbackService", () => {
  it("lets the running build upload its bundle to the release's own key", async () => {
    const { service, deps } = build();

    await expect(service.grant("build_1", "api-server")).resolves.toMatchObject({ url: "https://storage.example/signed" });
    expect(deps.store.sign).toHaveBeenCalledWith("write", "s3://uploads/spaces/project-1/releases/release-1/bundle.tar.gz", 900);
  });

  it.each([
    ["a finished run", { status: "completed" as const }],
    ["another tenant", { tenantId: "someone-else" }],
    ["a run that isn't a build", { release: null }],
    ["a release that has its outcome", { release: { ...RELEASE, status: "ready" as const } }],
  ])("refuses %s", async (_case, options) => {
    const { service } = build(options);

    await expect(service.grant("build_1", "api-server")).rejects.toBeInstanceOf(ReleaseCallbackDenied);
  });

  it("records a ready release with the tail of its build log", async () => {
    const { service, deps } = build();

    await expect(
      service.complete("build_1", "api-server", { outcome: "ready", sha256: "e".repeat(64), bundleBytes: 1234, nodeVersion: "v24.11.0", buildLog: `${"x".repeat(70_000)}end` }),
    ).resolves.toBe("ready");

    const [releaseId, outcome] = deps.releases.finish.mock.calls[0];
    expect(releaseId).toBe("release-1");
    expect(outcome).toMatchObject({ status: "ready", bundleSha256: "e".repeat(64), bundleBytes: 1234, nodeVersion: "v24.11.0" });
    expect(outcome.buildLog).toHaveLength(64_000);
    expect(outcome.buildLog?.endsWith("end")).toBe(true);
  });

  it("records a failed build with its reason", async () => {
    const { service, deps } = build();

    await expect(service.complete("build_1", "api-server", { outcome: "failed", reason: "The build command exited with code 1", buildLog: "npm ERR!" })).resolves.toBe("failed");
    expect(deps.releases.finish).toHaveBeenCalledWith("release-1", { status: "failed", failureReason: "The build command exited with code 1", buildLog: "npm ERR!" });
  });

  it("refuses a second outcome", async () => {
    const { service } = build({ finished: false });

    await expect(service.complete("build_1", "api-server", { outcome: "failed", reason: "x", buildLog: "" })).rejects.toBeInstanceOf(ReleaseCallbackDenied);
  });
});
