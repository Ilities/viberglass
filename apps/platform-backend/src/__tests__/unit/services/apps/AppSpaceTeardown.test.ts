import { RepositoryAccessError, type RepositoryHost } from "@viberglass/integration-core";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import type { AppPreviewRecord } from "../../../../persistence/apps/AppPreviewDAO";
import { AppClaims } from "../../../../services/apps/AppClaims";
import { AppSpaceTeardown } from "../../../../services/apps/AppSpaceTeardown";
import { appPreview, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-05T12:00:00Z");
const APP: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: null, backupDue: false };
const REPOSITORY = { fullName: "acme/laptops", url: "https://github.com/acme/laptops" };

function build(options: { app?: AppRecord | null; archive?: RepositoryHost["archiveRepository"]; unavailable?: string } = {}) {
  const host = fakeAppHost();
  const archiveRepository = jest.fn(options.archive ?? (async () => undefined));
  const codeHost = { parseRepository: jest.fn(() => REPOSITORY), archiveRepository };
  const deps = {
    apps: {
      get: jest.fn(async () => (options.app === undefined ? APP : options.app)),
      claim: jest.fn(async (): Promise<AppRecord | null> => APP),
      update: jest.fn(async () => undefined),
      finish: jest.fn(async () => undefined),
    },
    previews: {
      listForProject: jest.fn(async () => [appPreview({ id: "pv-1" }), appPreview({ id: "pv-2" })]),
      claim: jest.fn(async (id: string): Promise<AppPreviewRecord | null> => appPreview({ id })),
      finish: jest.fn(async () => undefined),
    },
    scmConfigs: { getByProjectId: jest.fn(async () => ({ sourceRepository: "acme/laptops" })) },
    repositories: {
      resolve: jest.fn(async () => (options.unavailable ? { unavailable: options.unavailable } : { host: codeHost, token: "tok" })),
    },
  };
  const settings = {
    list: jest.fn(async () => [
      { projectId: "space-1", name: "SLACK_CHANNEL", value: "#laptops", secretId: null, forPreviews: false, updatedAt: NOW },
      { projectId: "space-1", name: "SLACK_TOKEN", value: null, secretId: "sec-1", forPreviews: false, updatedAt: NOW },
    ]),
  };
  const secrets = { deleteSecret: jest.fn(async () => true) };
  const teardown = new AppSpaceTeardown(deps.apps, new AppClaims(deps.apps, deps.previews), () => host, deps.scmConfigs, deps.repositories, settings, secrets);
  return { teardown, host, deps, archiveRepository, secrets };
}

describe("AppSpaceTeardown", () => {
  it("removes the previews, the app and what the host keeps, then archives the repository", async () => {
    const { teardown, host, deps, archiveRepository, secrets } = build();

    await expect(teardown.tearDown("space-1", "Laptops", NOW)).resolves.toEqual([]);

    expect(deps.apps.claim).toHaveBeenCalledWith("space-1", new Date(NOW.getTime() - 15 * 60_000));
    expect(deps.apps.update).toHaveBeenCalledWith("space-1", { power: "off" });
    expect(host.delete.mock.calls).toEqual([["preview-pv-1"], ["preview-pv-2"], ["app-space-1"]]);
    expect(host.forgetSpace).toHaveBeenCalledWith("space-1");
    expect(secrets.deleteSecret.mock.calls).toEqual([["sec-1"]]);
    expect(archiveRepository).toHaveBeenCalledWith(REPOSITORY, "tok", expect.stringContaining('Archived by Viberglass on 2026-11-05, when the space "Laptops"'));
  });

  it("refuses while the app is busy, before removing anything", async () => {
    const { teardown, host, deps } = build();
    deps.apps.claim.mockResolvedValueOnce(null);

    await expect(teardown.tearDown("space-1", "Laptops", NOW)).rejects.toMatchObject({ code: "APP_BUSY" });
    expect(host.delete).not.toHaveBeenCalled();
    expect(deps.apps.update).not.toHaveBeenCalled();
  });

  it("lets go of what it claimed when a preview is busy", async () => {
    const { teardown, host, deps } = build();
    deps.previews.claim.mockImplementation(async (id: string) => (id === "pv-2" ? null : appPreview({ id })));

    await expect(teardown.tearDown("space-1", "Laptops", NOW)).rejects.toMatchObject({ code: "APP_BUSY" });
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", {});
    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", {});
    expect(host.delete).not.toHaveBeenCalled();
  });

  it("removes previews of a space whose app never had a release", async () => {
    const { teardown, host, deps } = build({ app: null });

    await teardown.tearDown("space-1", "Laptops", NOW);
    expect(deps.apps.claim).not.toHaveBeenCalled();
    expect(host.delete).toHaveBeenCalledWith("preview-pv-1");
  });

  it("says when the repository couldn't be archived, without failing", async () => {
    const refused = build({ archive: async () => Promise.reject(new RepositoryAccessError("REPOSITORY_FORBIDDEN", "This token can't archive acme/laptops.")) });
    await expect(refused.teardown.tearDown("space-1", "Laptops", NOW)).resolves.toEqual([
      "The repository acme/laptops wasn't archived: This token can't archive acme/laptops.",
    ]);

    const noToken = build({ unavailable: "The space's repository connection has no token" });
    await expect(noToken.teardown.tearDown("space-1", "Laptops", NOW)).resolves.toEqual([
      "The repository acme/laptops wasn't archived: The space's repository connection has no token.",
    ]);
  });

  it("lets a host error stop the deletion", async () => {
    const { teardown, host, archiveRepository } = build();
    host.delete.mockRejectedValueOnce(new Error("docker down"));

    await expect(teardown.tearDown("space-1", "Laptops", NOW)).rejects.toThrow("docker down");
    expect(archiveRepository).not.toHaveBeenCalled();
  });
});
