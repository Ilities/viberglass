import { AppInstanceSpecs } from "../../../../services/apps/AppInstanceSpecs";
import { ECS_APPS_ENV } from "../../../helpers/ecsAppsEnv";
import { appRelease } from "../../../helpers/fakeAppHost";

describe("AppInstanceSpecs on ECS", () => {
  const credentials = { forApp: jest.fn(), forPreview: jest.fn() };
  const specs = new AppInstanceSpecs(credentials, () => ECS_APPS_ENV);

  it("names the bundle by its key and leaves the credentials to the task role", async () => {
    const release = appRelease("r1", { bundleSha256: "abc" });

    const spec = await specs.specFor("ecs", release);
    const preview = await specs.specFor("ecs", release, { kind: "preview", instance: "preview-x" });

    expect(spec.env).toEqual({
      VIBERGLASS_BUNDLE_KEY: "spaces/space-1/releases/r1/bundle.tar.gz",
      VIBERGLASS_BUNDLE_SHA256: "abc",
      VIBERGLASS_DATA_BUCKET: "dev-viberglass-uploads",
      VIBERGLASS_DATA_PATH: "spaces/space-1/app-data",
      VIBERGLASS_DATA_REGION: "eu-west-1",
    });
    expect(preview.env).toMatchObject({ VIBERGLASS_DATA_MODE: "preview" });
    expect(preview.env).not.toHaveProperty("AWS_SESSION_TOKEN");
    expect(credentials.forApp).not.toHaveBeenCalled();
    expect(credentials.forPreview).not.toHaveBeenCalled();
  });
});
