import type { McpServer } from "@viberglass/types";
import { McpServerService } from "../../../../services/mcpServers/McpServerService";
import type { McpServerDAO } from "../../../../persistence/mcpServer/McpServerDAO";
import type { SecretRecord } from "../../../../persistence/secret/SecretDAO";

const existing: McpServer = { id: "m1", name: "linear", url: "https://mcp.linear.app/mcp", headers: [], createdAt: "", updatedAt: "" };

function daoWith(overrides: Partial<Record<keyof McpServerDAO, jest.Mock>>): McpServerDAO {
  return Object.assign(Object.create(null), {
    list: jest.fn(),
    get: jest.fn(async () => existing),
    getByIds: jest.fn(),
    findByName: jest.fn(async () => null),
    create: jest.fn(async () => existing),
    update: jest.fn(async () => existing),
    delete: jest.fn(),
    runnersUsing: jest.fn(async () => []),
    ...overrides,
  });
}

const secrets = (found: string[]) => ({
  getSecretsByIds: jest.fn(async (): Promise<SecretRecord[]> =>
    found.map((id) => ({
      id,
      name: id,
      secretLocation: "database" as const,
      secretPath: null,
      secretValueEncrypted: null,
      sourceEnvVar: null,
      provider: null,
      purpose: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  ),
});

describe("McpServerService", () => {
  it("refuses a name another server has", async () => {
    const service = new McpServerService(daoWith({ findByName: jest.fn(async () => existing) }), secrets([]));
    await expect(service.create({ name: "linear", url: "https://x" })).rejects.toThrow('An MCP server named "linear" already exists');
  });

  it("lets a server keep its own name when edited", async () => {
    const dao = daoWith({ findByName: jest.fn(async () => existing) });
    await new McpServerService(dao, secrets([])).update("m1", { name: "linear", url: "https://x" });
    expect(dao.update).toHaveBeenCalled();
  });

  it("refuses headers from secrets that don't exist", async () => {
    const service = new McpServerService(daoWith({}), secrets(["s1"]));
    await expect(
      service.create({ name: "a", url: "https://a", headers: [{ name: "A", secretId: "s1" }, { name: "B", secretId: "gone" }] }),
    ).rejects.toThrow("Secrets not found: gone");
  });

  it("won't remove a server a runner still uses", async () => {
    const service = new McpServerService(daoWith({ runnersUsing: jest.fn(async () => ["Main runner"]) }), secrets([]));
    await expect(service.delete("m1")).rejects.toThrow("Main runner");
  });
});
