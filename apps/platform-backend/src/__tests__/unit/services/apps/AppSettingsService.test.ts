import type { AppSettingRecord } from "../../../../persistence/apps/AppSettingDAO";
import { AppSettingsService } from "../../../../services/apps/AppSettingsService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const SPACE = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false };
const UPDATED = new Date("2026-11-05T12:00:00Z");

function stored(overrides: Partial<AppSettingRecord>): AppSettingRecord {
  return { projectId: "space-1", name: "SLACK_TOKEN", value: null, secretId: "sec-1", forPreviews: false, updatedAt: UPDATED, ...overrides };
}

function build(existing: AppSettingRecord[] = []) {
  const rows = new Map(existing.map((setting) => [setting.name, setting]));
  const deps = {
    spaces: { findById: jest.fn(async () => SPACE) },
    settings: {
      list: jest.fn(async () => [...rows.values()]),
      get: jest.fn(async (_projectId: string, name: string) => rows.get(name) ?? null),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
    },
    secrets: {
      createSecret: jest.fn(async () => ({ id: "sec-new" })),
      updateSecret: jest.fn(async () => ({ id: "sec-1" })),
      deleteSecret: jest.fn(async () => true),
    },
    releases: { declaredSettings: jest.fn(async () => [{ name: "SLACK_TOKEN", secret: true }, { name: "SLACK_CHANNEL", secret: false }]) },
    apps: { get: jest.fn(async () => null), requestRestart: jest.fn(async () => undefined) },
    reconciler: { reconcile: jest.fn(async () => true) },
    storage: jest.fn(() => ({ secretLocation: "ssm" as const, secretPath: "/viberator/secrets/apps/space-1/SLACK_TOKEN" })),
  };
  const service = new AppSettingsService(
    deps.spaces,
    deps.settings,
    deps.secrets,
    deps.releases,
    deps.apps,
    deps.reconciler,
    deps.storage,
  );
  return { service, deps };
}

describe("AppSettingsService", () => {
  it("shows plain values, hides secret ones, and lists declared settings that aren't set", async () => {
    const { service } = build([stored({ name: "SLACK_CHANNEL", value: "#laptops", secretId: null }), stored({})]);

    await expect(service.view("space-1")).resolves.toEqual({
      settings: [
        { name: "SLACK_CHANNEL", secret: false, value: "#laptops", forPreviews: true, updatedAt: UPDATED.toISOString() },
        { name: "SLACK_TOKEN", secret: true, value: null, forPreviews: false, updatedAt: UPDATED.toISOString() },
      ],
      declared: [{ name: "SLACK_TOKEN", secret: true }, { name: "SLACK_CHANNEL", secret: false }],
      missing: [],
    });
  });

  it("keeps a new secret in the secret store and restarts the app", async () => {
    const { service, deps } = build();

    await service.save("space-1", "SLACK_TOKEN", { secret: true, value: "xoxb-1", forPreviews: true }, "user-1");

    expect(deps.secrets.createSecret).toHaveBeenCalledWith({
      name: "Laptops · SLACK_TOKEN",
      purpose: "app_setting",
      secretLocation: "ssm",
      secretPath: "/viberator/secrets/apps/space-1/SLACK_TOKEN",
      secretValue: "xoxb-1",
    });
    expect(deps.settings.put).toHaveBeenCalledWith("space-1", "SLACK_TOKEN", { value: null, secretId: "sec-new", forPreviews: true, updatedBy: "user-1" });
    expect(deps.apps.requestRestart).toHaveBeenCalledWith("space-1");
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("keeps a secret's value when it's saved without one, and replaces it when given", async () => {
    const { service, deps } = build([stored({ forPreviews: true })]);

    await service.save("space-1", "SLACK_TOKEN", { secret: true, forPreviews: false }, "user-1");
    expect(deps.secrets.updateSecret).not.toHaveBeenCalled();
    expect(deps.settings.put).toHaveBeenCalledWith("space-1", "SLACK_TOKEN", { value: null, secretId: "sec-1", forPreviews: false, updatedBy: "user-1" });

    await service.save("space-1", "SLACK_TOKEN", { secret: true, value: "xoxb-2" }, "user-1");
    expect(deps.secrets.updateSecret).toHaveBeenCalledWith("sec-1", { secretValue: "xoxb-2" });
    expect(deps.secrets.createSecret).not.toHaveBeenCalled();
  });

  it("deletes the secret once a setting becomes plain, after the row stops pointing at it", async () => {
    const { service, deps } = build([stored({})]);

    await service.save("space-1", "SLACK_TOKEN", { secret: false, value: "not secret after all" }, "user-1");

    expect(deps.settings.put).toHaveBeenCalledWith("space-1", "SLACK_TOKEN", { value: "not secret after all", secretId: null, forPreviews: false, updatedBy: "user-1" });
    expect(deps.settings.put.mock.invocationCallOrder[0]).toBeLessThan(deps.secrets.deleteSecret.mock.invocationCallOrder[0]);
    expect(deps.secrets.deleteSecret).toHaveBeenCalledWith("sec-1");
  });

  it("refuses reserved and malformed names, oversized values, and new settings without a value", async () => {
    const { service, deps } = build();

    await expect(service.save("space-1", "AWS_SECRET_ACCESS_KEY", { secret: true, value: "x" }, "u")).rejects.toMatchObject({ code: "SETTING_INVALID" });
    await expect(service.save("space-1", "slack token", { secret: false, value: "x" }, "u")).rejects.toMatchObject({ code: "SETTING_INVALID" });
    await expect(service.save("space-1", "BIG", { secret: false, value: "x".repeat(3901) }, "u")).rejects.toMatchObject({ code: "SETTING_INVALID" });
    await expect(service.save("space-1", "NEW_SECRET", { secret: true }, "u")).rejects.toMatchObject({ code: "SETTING_INVALID" });
    await expect(service.save("space-1", "NEW_PLAIN", { secret: false }, "u")).rejects.toMatchObject({ code: "SETTING_INVALID" });
    expect(deps.settings.put).not.toHaveBeenCalled();
    expect(deps.apps.requestRestart).not.toHaveBeenCalled();
  });

  it("drops a new secret again when the setting can't be saved", async () => {
    const { service, deps } = build();
    deps.settings.put.mockRejectedValueOnce(new Error("database down"));

    await expect(service.save("space-1", "SLACK_TOKEN", { secret: true, value: "x" }, "u")).rejects.toThrow("database down");
    expect(deps.secrets.deleteSecret).toHaveBeenCalledWith("sec-new");
  });

  it("removes a setting with its secret and restarts the app", async () => {
    const { service, deps } = build([stored({})]);

    await service.remove("space-1", "SLACK_TOKEN");
    expect(deps.settings.delete).toHaveBeenCalledWith("space-1", "SLACK_TOKEN");
    expect(deps.secrets.deleteSecret).toHaveBeenCalledWith("sec-1");
    expect(deps.apps.requestRestart).toHaveBeenCalled();

    await expect(service.remove("space-1", "NOPE")).rejects.toMatchObject({ code: "SETTING_NOT_FOUND" });
  });
});
