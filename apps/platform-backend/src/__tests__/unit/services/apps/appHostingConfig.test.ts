import { ecsAppHostOptions, fargateSize } from "../../../../services/apps/appHostingConfig";
import { ECS_APPS_ENV } from "../../../helpers/ecsAppsEnv";

describe("ecsAppHostOptions", () => {
  it("reads what the platform stack sets, with the smallest Fargate size by default", () => {
    expect(ecsAppHostOptions(ECS_APPS_ENV)).toEqual({
      region: "eu-west-1",
      prefix: "dev-viberglass",
      cluster: "arn:aws:ecs:eu-west-1:1:cluster/apps",
      subnetIds: ["subnet-a", "subnet-b"],
      securityGroupId: "sg-apps",
      assignPublicIp: false,
      executionRoleArn: "arn:aws:iam::1:role/apps-exec",
      logGroup: "/ecs/viberglass-dev-apps",
      namespace: { id: "ns-1", name: "apps.dev.viberglass.internal" },
      rolePath: "/viberglass/dev/apps/",
      permissionsBoundaryArn: "arn:aws:iam::1:policy/boundary",
      bucket: "dev-viberglass-uploads",
      size: { cpu: "256", memory: "512" },
    });
    expect(ecsAppHostOptions({ ...ECS_APPS_ENV, ECS_APPS_ASSIGN_PUBLIC_IP: "true" })?.assignPublicIp).toBe(true);
  });

  it("is null unless all of it is set", () => {
    expect(ecsAppHostOptions({})).toBeNull();
    expect(ecsAppHostOptions({ ...ECS_APPS_ENV, ECS_APPS_SUBNET_IDS: " , " })).toBeNull();
    expect(ecsAppHostOptions({ ...ECS_APPS_ENV, ECS_APPS_PERMISSIONS_BOUNDARY_ARN: "" })).toBeNull();
  });
});

describe("fargateSize", () => {
  it("rounds up to a size Fargate runs", () => {
    expect(fargateSize(0.25, 512)).toEqual({ cpu: "256", memory: "512" });
    expect(fargateSize(0.25, 700)).toEqual({ cpu: "256", memory: "1024" });
    expect(fargateSize(1, 512)).toEqual({ cpu: "1024", memory: "2048" });
    // More memory than a quarter vCPU can have.
    expect(fargateSize(0.25, 3000)).toEqual({ cpu: "512", memory: "3072" });
    expect(fargateSize(64, 1)).toEqual({ cpu: "16384", memory: "122880" });
  });
});
