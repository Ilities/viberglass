import { buildLambdaFunctionName } from "../../../provisioning/strategies/lambdaFunctionUtils";
import { buildClanker } from "./testUtils";

describe("buildLambdaFunctionName", () => {
  it("builds the function name from clanker name", () => {
    const clanker = buildClanker("lambda", null);
    clanker.name = "My Cool Clanker";

    expect(buildLambdaFunctionName(clanker)).toBe("viberator-my-cool-clanker");
  });

  it("normalizes unsupported characters and enforces length limit", () => {
    const clanker = buildClanker("lambda", null);
    clanker.name =
      "### Very Loud Clanker Name With Spaces And Symbols !!! ### And More Text For Length";

    const functionName = buildLambdaFunctionName(clanker);

    expect(functionName).toMatch(/^viberator-[a-z0-9-_]+$/);
    expect(functionName.length).toBeLessThanOrEqual(64);
  });
});
