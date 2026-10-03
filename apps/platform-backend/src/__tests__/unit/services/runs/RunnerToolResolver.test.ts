import type { McpServer } from "@viberglass/types";
import { RunnerToolResolver } from "../../../../services/runs/RunnerToolResolver";
import type { SkillRecord } from "../../../../persistence/skill/SkillDAO";

const server = (name: string, headers: McpServer["headers"]): McpServer => ({
  id: `${name}-id`,
  name,
  url: `https://${name}.example/mcp`,
  headers,
  createdAt: "",
  updatedAt: "",
});

describe("RunnerToolResolver", () => {
  it("binds secret headers to worker-only variables and passes plain ones as they are", async () => {
    const resolver = new RunnerToolResolver(
      {
        getByIds: jest.fn(async () => [
          server("linear", [{ name: "Authorization", secretId: "s1", prefix: "Bearer " }]),
          server("docs", [
            { name: "X-Team", value: "web" },
            { name: "X-Key", secretId: "s2" },
          ]),
        ]),
      },
      { getByIds: jest.fn(async (): Promise<SkillRecord[]> => [{ id: "k1", name: "pdf-forms", description: "", storageUrl: "s3://b/k", fileCount: 1, sizeBytes: 1, createdAt: "", updatedAt: "" }]) },
    );

    const tools = await resolver.resolve({ mcpServerIds: ["linear-id", "docs-id"], skillIds: ["k1"] });

    expect(tools.mcpServers).toEqual([
      { name: "linear", url: "https://linear.example/mcp", headers: [{ name: "Authorization", envVar: "VIBERGLASS_MCP_0_0", prefix: "Bearer " }] },
      {
        name: "docs",
        url: "https://docs.example/mcp",
        headers: [
          { name: "X-Team", value: "web" },
          { name: "X-Key", envVar: "VIBERGLASS_MCP_1_1" },
        ],
      },
    ]);
    expect(tools.secretBindings).toEqual([
      { envVar: "VIBERGLASS_MCP_0_0", secretId: "s1" },
      { envVar: "VIBERGLASS_MCP_1_1", secretId: "s2" },
    ]);
    expect(tools.skills).toEqual([{ id: "k1", name: "pdf-forms" }]);
  });
});
