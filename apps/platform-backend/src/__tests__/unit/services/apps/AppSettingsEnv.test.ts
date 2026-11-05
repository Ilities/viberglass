import type { AppSettingRecord } from "../../../../persistence/apps/AppSettingDAO";
import { AppSettingsEnv } from "../../../../services/apps/AppSettingsEnv";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const UPDATED = new Date("2026-11-05T12:00:00Z");
const SETTINGS: AppSettingRecord[] = [
  { projectId: "space-1", name: "SLACK_CHANNEL", value: "#laptops", secretId: null, forPreviews: false, updatedAt: UPDATED },
  { projectId: "space-1", name: "SLACK_TOKEN", value: null, secretId: "sec-1", forPreviews: true, updatedAt: UPDATED },
  { projectId: "space-1", name: "STRIPE_KEY", value: null, secretId: "sec-2", forPreviews: false, updatedAt: UPDATED },
];

function build(ssm = true) {
  const secrets = {
    getSecret: jest.fn(async (id: string) => ({ secretLocation: ssm ? ("ssm" as const) : ("database" as const), secretPath: ssm ? `/viberator/secrets/apps/space-1/${id}` : null })),
    resolveSecretValues: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, `value-of-${id}`]))),
  };
  return { env: new AppSettingsEnv({ list: jest.fn(async () => SETTINGS) }, secrets), secrets };
}

describe("AppSettingsEnv", () => {
  it("gives the live app every setting", async () => {
    await expect(build().env.forInstance("space-1", false, "docker")).resolves.toEqual({
      env: { SLACK_CHANNEL: "#laptops", SLACK_TOKEN: "value-of-sec-1", STRIPE_KEY: "value-of-sec-2" },
      secretRefs: [],
    });
  });

  it("gives a preview plain settings and only the secrets marked for previews", async () => {
    const { env, secrets } = build();

    await expect(env.forInstance("space-1", true, "kubernetes")).resolves.toEqual({ env: { SLACK_CHANNEL: "#laptops", SLACK_TOKEN: "value-of-sec-1" }, secretRefs: [] });
    expect(secrets.resolveSecretValues).toHaveBeenCalledWith(["sec-1"]);
  });

  it("leaves secrets as SSM references on ECS, without reading their values", async () => {
    const { env, secrets } = build();

    await expect(env.forInstance("space-1", false, "ecs")).resolves.toEqual({
      env: { SLACK_CHANNEL: "#laptops" },
      secretRefs: [
        { name: "SLACK_TOKEN", ssmParameter: "/viberator/secrets/apps/space-1/sec-1" },
        { name: "STRIPE_KEY", ssmParameter: "/viberator/secrets/apps/space-1/sec-2" },
      ],
    });
    expect(secrets.resolveSecretValues).not.toHaveBeenCalled();
  });

  it("refuses to start on ECS with a secret that isn't in SSM", async () => {
    await expect(build(false).env.forInstance("space-1", false, "ecs")).rejects.toThrow("SLACK_TOKEN isn't kept in SSM");
  });
});
