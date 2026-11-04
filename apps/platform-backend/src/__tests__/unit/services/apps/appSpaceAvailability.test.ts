import { appSpaceAvailability, appsDomain } from "../../../../services/apps/appSpaceAvailability";
import { ECS_APPS_ENV } from "../../../helpers/ecsAppsEnv";

const HOME = { integrationId: "integration-1", credentialId: null, owner: "acme" };

describe("appSpaceAvailability", () => {
  it("needs an apps domain, object storage and an App home", () => {
    expect(appSpaceAvailability({}, null)).toEqual({ available: false, missing: ["apps_domain", "object_storage", "app_home"] });
    expect(appSpaceAvailability({ APPS_DOMAIN: "apps.example.com", S3_BUCKET: "uploads", S3_REGION: "eu-west-1" }, HOME))
      .toEqual({ available: true, missing: [] });
  });

  it("needs somewhere to run apps", () => {
    const ready = { APPS_DOMAIN: "apps.example.com", S3_BUCKET: "uploads", S3_REGION: "eu-west-1" };
    expect(appSpaceAvailability({ ...ready, KUBERNETES_WORKER_NAMESPACE: "workers" }, HOME)).toEqual({ available: false, missing: ["app_host"] });
    expect(appSpaceAvailability({ ...ready, KUBERNETES_WORKER_NAMESPACE: "workers", KUBERNETES_APPS_NAMESPACE: "apps" }, HOME).available).toBe(true);
    expect(appSpaceAvailability({ ...ready, AWS_EXECUTION_ENV: "AWS_ECS_FARGATE" }, HOME).missing).toEqual(["app_host"]);
    expect(appSpaceAvailability({ ...ready, ...ECS_APPS_ENV, AWS_EXECUTION_ENV: "AWS_ECS_FARGATE" }, HOME).available).toBe(true);
  });

  it("reads the apps domain without a wildcard or trailing dot", () => {
    expect(appsDomain({ APPS_DOMAIN: " *.Apps.Example.com. " })).toBe("apps.example.com");
    expect(appsDomain({ APPS_DOMAIN: " " })).toBeNull();
  });
});
