import { AppInstanceSpecs } from "../../../../services/apps/AppInstanceSpecs";
import { ECS_APPS_ENV } from "../../../helpers/ecsAppsEnv";
import { appRelease } from "../../../helpers/fakeAppHost";

describe("AppInstanceSpecs on ECS", () => {
  const credentials = { forApp: jest.fn(), forPreview: jest.fn() };
  const settings = { forInstance: jest.fn(async () => ({ env: {}, secretRefs: [] as Array<{ name: string; ssmParameter: string }> })) };
  const specs = new AppInstanceSpecs(credentials, settings, () => ECS_APPS_ENV);

  it("names the bundle by its key and leaves the credentials to the task role", async () => {
    const release = appRelease("r1", { bundleSha256: "abc" });

    const { spec, credentialsExpireAt } = await specs.specFor("ecs", release);
    const { spec: preview } = await specs.specFor("ecs", release, { kind: "preview", instance: "preview-x" });

    expect(spec.env).toEqual({
      VIBERGLASS_BUNDLE_KEY: "spaces/space-1/releases/r1/bundle.tar.gz",
      VIBERGLASS_BUNDLE_SHA256: "abc",
      VIBERGLASS_DATA_BUCKET: "dev-viberglass-uploads",
      VIBERGLASS_DATA_PATH: "spaces/space-1/app-data",
      VIBERGLASS_DATA_REGION: "eu-west-1",
    });
    expect(preview.env).toMatchObject({ VIBERGLASS_DATA_MODE: "preview" });
    expect(preview.env).not.toHaveProperty("AWS_SESSION_TOKEN");
    expect(credentialsExpireAt).toBeNull();
    expect(credentials.forApp).not.toHaveBeenCalled();
    expect(credentials.forPreview).not.toHaveBeenCalled();
  });

  it("puts the app's settings under what the runtime sets, and passes secret references on", async () => {
    settings.forInstance.mockResolvedValueOnce({ env: { SLACK_CHANNEL: "#laptops" }, secretRefs: [{ name: "SLACK_TOKEN", ssmParameter: "/viberator/secrets/apps/space-1/SLACK_TOKEN" }] });

    const { spec } = await specs.specFor("ecs", appRelease("r1", { bundleSha256: "abc" }));

    expect(settings.forInstance).toHaveBeenCalledWith("space-1", false, "ecs");
    expect(spec.env).toMatchObject({ SLACK_CHANNEL: "#laptops", VIBERGLASS_DATA_PATH: "spaces/space-1/app-data" });
    expect(spec.secretRefs).toEqual([{ name: "SLACK_TOKEN", ssmParameter: "/viberator/secrets/apps/space-1/SLACK_TOKEN" }]);
  });
});
