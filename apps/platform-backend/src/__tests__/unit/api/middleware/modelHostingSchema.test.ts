import { modelDeploymentSchema } from "../../../../api/middleware/modelHostingSchema";

const deployment = {
  name: "Qwen",
  accountId: "11111111-1111-4111-8111-111111111111",
  model: "Qwen/Qwen3-8B",
  flavour: { id: "L40S", gpuCount: 1 },
};

describe("model deployment schema", () => {
  test("refuses a flag and its value glued into one serving argument, which vLLM exits on", () => {
    const { error } = modelDeploymentSchema.validate({
      ...deployment,
      servingArgs: ["--enable-auto-tool-choice", "--tool-call-parser qwen3_xml"],
    });
    expect(error?.message).toBe(
      "Pass each flag and its value as separate serving arguments: --tool-call-parser qwen3_xml",
    );
  });

  test("accepts separate flags and values, flag=value and JSON values with spaces", () => {
    for (const servingArgs of [
      ["--tool-call-parser", "qwen3_xml"],
      ['--speculative-config={"a": 1}'],
      ["--speculative-config", '{"a": 1}'],
    ])
      expect(modelDeploymentSchema.validate({ ...deployment, servingArgs }).error).toBeUndefined();
  });
});
