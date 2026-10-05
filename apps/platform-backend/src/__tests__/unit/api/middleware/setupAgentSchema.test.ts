import { setupAgentSchema } from "../../../../api/middleware/schemas";

describe("setupAgentSchema", () => {
  it("takes a provider, or a model endpoint with the model to run on it", () => {
    expect(setupAgentSchema.validate({ provider: "anthropic" }).error).toBeUndefined();
    expect(setupAgentSchema.validate({ endpointId: "11111111-1111-4111-8111-111111111111", model: "glm-4.7-flash" }).error).toBeUndefined();
  });

  it("refuses an endpoint without a model, or a provider it doesn't know", () => {
    expect(setupAgentSchema.validate({ endpointId: "11111111-1111-4111-8111-111111111111" }).error).toBeDefined();
    expect(setupAgentSchema.validate({ provider: "nobody" }).error).toBeDefined();
  });
});
