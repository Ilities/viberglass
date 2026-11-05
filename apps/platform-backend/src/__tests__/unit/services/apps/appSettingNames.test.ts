import { appSettingNameProblem, parseAppManifest } from "@viberglass/types";

describe("app setting names", () => {
  it("allows upper-case names that aren't the runtime's own", () => {
    expect(appSettingNameProblem("SLACK_WEBHOOK_URL")).toBeNull();
    expect(appSettingNameProblem("AWSOME")).toBeNull();
  });

  it("refuses malformed, long and reserved names", () => {
    expect(appSettingNameProblem("slack")).toMatch(/upper-case/);
    expect(appSettingNameProblem(`A${"B".repeat(100)}`)).toMatch(/at most 100/);
    for (const name of ["PORT", "HOME", "PATH", "NODE_OPTIONS", "APP_DATABASE_PATH", "VIBERGLASS_DATA_PATH", "AWS_ACCESS_KEY_ID", "LITESTREAM_CONFIG"]) {
      expect(appSettingNameProblem(name)).toMatch(/set by Viberglass itself/);
    }
  });

  it("fails a manifest that declares a reserved name", () => {
    expect(parseAppManifest({ build: "npm ci", start: "node server.js", settings: [{ name: "AWS_REGION", secret: false }] })).toEqual({
      error: expect.stringContaining("AWS_REGION is set by Viberglass itself"),
    });
  });
});
