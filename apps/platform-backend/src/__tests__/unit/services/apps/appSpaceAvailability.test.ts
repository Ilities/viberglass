import { appSpaceAvailability, appsDomain } from "../../../../services/apps/appSpaceAvailability";

const HOME = { integrationId: "integration-1", credentialId: null, owner: "acme" };

describe("appSpaceAvailability", () => {
  it("needs an apps domain, object storage and an App home", () => {
    expect(appSpaceAvailability({}, null)).toEqual({ available: false, missing: ["apps_domain", "object_storage", "app_home"] });
    expect(appSpaceAvailability({ APPS_DOMAIN: "apps.example.com", S3_BUCKET: "uploads", S3_REGION: "eu-west-1" }, HOME))
      .toEqual({ available: true, missing: [] });
  });

  it("reads the apps domain without a wildcard or trailing dot", () => {
    expect(appsDomain({ APPS_DOMAIN: " *.Apps.Example.com. " })).toBe("apps.example.com");
    expect(appsDomain({ APPS_DOMAIN: " " })).toBeNull();
  });
});
