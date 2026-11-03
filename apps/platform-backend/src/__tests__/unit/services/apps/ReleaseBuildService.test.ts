import type { AppRelease, Clanker, IntegrationCredential, ProjectScmConfig } from "@viberglass/types";
import type { JobData } from "../../../../types/Job";
import { ReleaseBuildService } from "../../../../services/apps/ReleaseBuildService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const COMMIT = "b".repeat(40);
const SCM: ProjectScmConfig = {
  projectId: "project-1",
  integrationId: "integration-1",
  integrationSystem: "github",
  sourceRepository: "https://github.com/acme/laptops",
  baseBranch: "main",
  integrationCredentialId: "credential-1",
  createdAt: "",
  updatedAt: "",
};
const RELEASE: AppRelease = {
  id: "release-1",
  projectId: "project-1",
  commitSha: COMMIT,
  status: "building",
  jobId: null,
  bundleSha256: null,
  bundleBytes: null,
  nodeVersion: null,
  buildLog: null,
  failureReason: null,
  wentLiveAt: null,
  liveFailure: null,
  createdAt: "",
  finishedAt: null,
};
const BUILDER: Clanker = {
  id: "builder-1",
  name: "App builder",
  slug: "viberglass-app-builder",
  deploymentConfig: { version: 1, strategy: { type: "docker", containerImage: "builder:local" }, agent: { type: "claude-code" } },
  configFiles: [],
  secretBindings: [],
  mcpServerIds: [],
  skillIds: [],
  status: "active",
  createdAt: "",
  updatedAt: "",
};

const CREDENTIAL: IntegrationCredential = {
  id: "credential-1",
  integrationId: "integration-1",
  name: "Token",
  credentialType: "token",
  secretId: "secret-1",
  secretLocation: "database",
  isDefault: true,
  createdAt: "",
  updatedAt: "",
};

function build(options: { existing?: boolean; submitFails?: boolean } = {}) {
  const deps = {
    releases: {
      createBuilding: jest.fn(async () => (options.existing ? null : RELEASE)),
      setJob: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    },
    builder: { ready: jest.fn(async () => BUILDER) },
    credentials: {
      getById: jest.fn(async (): Promise<IntegrationCredential | null> => CREDENTIAL),
      getDefaultForIntegration: jest.fn(async (): Promise<IntegrationCredential | null> => null),
    },
    jobs: {
      submitJob: jest.fn(async (_job: JobData, _options?: { clankerId?: string }) => {
        if (options.submitFails) throw new Error("database down");
        return { jobId: "job", status: "queued", timestamp: "", callbackToken: "callback-1" };
      }),
    },
    bootstraps: { saveBootstrapPayload: jest.fn(async (_jobId: string, _payload: Record<string, unknown>) => undefined) },
    requirements: { getRequiredCredentialsForClanker: jest.fn(async () => [{ envVar: "VIBERGLASS_SCM_TOKEN" }]) },
    workers: { executeJob: jest.fn(async (_job: JobData, _runner: Clanker) => ({ success: true, attempts: 1 })) },
  };
  const service = new ReleaseBuildService(
    deps.releases,
    deps.builder,
    deps.credentials,
    deps.jobs,
    deps.bootstraps,
    deps.requirements,
    deps.workers,
  );
  return { service, deps };
}

describe("ReleaseBuildService", () => {
  it("builds the commit on the app builder with the space's repository token", async () => {
    const { service, deps } = build();

    await expect(service.build(SCM, COMMIT)).resolves.toBe(RELEASE);

    const [jobData, options] = deps.jobs.submitJob.mock.calls[0];
    expect(options).toEqual({ clankerId: "builder-1" });
    expect(jobData).toMatchObject({
      jobKind: "build_release",
      repository: SCM.sourceRepository,
      context: { projectId: "project-1", releaseId: "release-1", commitSha: COMMIT },
      scm: { credentialEnvVar: "VIBERGLASS_SCM_TOKEN", gitUsername: "x-access-token" },
    });
    expect(deps.releases.setJob).toHaveBeenCalledWith("release-1", jobData.id);

    const executionRunner = deps.workers.executeJob.mock.calls[0][1];
    expect(executionRunner.secretBindings).toEqual([{ envVar: "VIBERGLASS_SCM_TOKEN", secretId: "secret-1" }]);
    const payload = deps.bootstraps.saveBootstrapPayload.mock.calls[0][1];
    expect(payload).toMatchObject({
      workerType: "docker",
      jobKind: "build_release",
      release: { releaseId: "release-1", commitSha: COMMIT },
      requiredCredentials: [{ envVar: "VIBERGLASS_SCM_TOKEN" }],
      callbackToken: "callback-1",
    });
  });

  it("builds a commit only once", async () => {
    const { service, deps } = build({ existing: true });

    await expect(service.build(SCM, COMMIT)).resolves.toBeNull();
    expect(deps.jobs.submitJob).not.toHaveBeenCalled();
  });

  it("forgets the release when the build couldn't be started, so the commit is tried again", async () => {
    const { service, deps } = build({ submitFails: true });

    await expect(service.build(SCM, COMMIT)).rejects.toThrow("database down");
    expect(deps.releases.delete).toHaveBeenCalledWith("release-1");
  });

  it("doesn't start without a token to clone with", async () => {
    const { service, deps } = build();
    deps.credentials.getById.mockResolvedValue(null);

    await expect(service.build({ ...SCM, integrationCredentialId: null }, COMMIT)).rejects.toThrow("no token");
    expect(deps.releases.createBuilding).not.toHaveBeenCalled();
  });
});
