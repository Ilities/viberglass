import { ProvisioningStrategyResolver } from "../../../provisioning/ProvisioningStrategyResolver";

describe("ProvisioningStrategyResolver", () => {
  const resolver = new ProvisioningStrategyResolver();

  it("normalizes aws-lambda-container alias to lambda", () => {
    const resolution = resolver.resolve("aws-lambda-container");

    expect(resolution).toEqual({
      kind: "resolved",
      strategy: "lambda",
    });
  });

  it("returns missing strategy for empty names", () => {
    const resolution = resolver.resolve("  ");

    expect(resolution).toEqual({
      kind: "missing",
      message: "Deployment strategy not configured",
    });
  });

  it("returns unsupported strategy details", () => {
    const resolution = resolver.resolve("unsupported-provider");

    expect(resolution).toEqual({
      kind: "unsupported",
      providedName: "unsupported-provider",
      message: "Unsupported deployment strategy: unsupported-provider",
    });
  });
});
