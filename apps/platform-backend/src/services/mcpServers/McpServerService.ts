import { isSecretHeader, type McpServer, type McpServerInput } from "@viberglass/types";
import { McpServerDAO } from "../../persistence/mcpServer/McpServerDAO";
import { SecretDAO } from "../../persistence/secret/SecretDAO";
import { AGENT_TOOL_ERROR_CODE, AgentToolServiceError } from "../errors/AgentToolServiceError";

/** The workspace's approved MCP servers, which runners pick from. */
export class McpServerService {
  constructor(
    private readonly servers: McpServerDAO = new McpServerDAO(),
    private readonly secrets: Pick<SecretDAO, "getSecretsByIds"> = new SecretDAO(),
  ) {}

  list(): Promise<McpServer[]> {
    return this.servers.list();
  }

  async create(input: McpServerInput): Promise<McpServer> {
    await this.assertValid(input);
    return this.servers.create(input);
  }

  async update(id: string, input: McpServerInput): Promise<McpServer> {
    await this.require(id);
    await this.assertValid(input, id);
    const updated = await this.servers.update(id, input);
    if (!updated) throw notFound();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.require(id);
    const runners = await this.servers.runnersUsing(id);
    if (runners.length > 0) {
      throw new AgentToolServiceError(
        AGENT_TOOL_ERROR_CODE.IN_USE,
        `Remove the MCP server from these agents first: ${runners.join(", ")}.`,
      );
    }
    await this.servers.delete(id);
  }

  private async require(id: string): Promise<McpServer> {
    const server = await this.servers.get(id);
    if (!server) throw notFound();
    return server;
  }

  private async assertValid(input: McpServerInput, exceptId?: string): Promise<void> {
    const sameName = await this.servers.findByName(input.name);
    if (sameName && sameName.id !== exceptId) {
      throw new AgentToolServiceError(AGENT_TOOL_ERROR_CODE.NAME_TAKEN, `An MCP server named "${input.name}" already exists.`);
    }

    const secretIds = (input.headers ?? []).filter(isSecretHeader).map((header) => header.secretId);
    const found = new Set((await this.secrets.getSecretsByIds(secretIds)).map((secret) => secret.id));
    const missing = secretIds.filter((secretId) => !found.has(secretId));
    if (missing.length > 0) {
      throw new AgentToolServiceError(AGENT_TOOL_ERROR_CODE.INVALID, `Secrets not found: ${missing.join(", ")}`);
    }
  }
}

function notFound(): AgentToolServiceError {
  return new AgentToolServiceError(AGENT_TOOL_ERROR_CODE.NOT_FOUND, "MCP server not found");
}
