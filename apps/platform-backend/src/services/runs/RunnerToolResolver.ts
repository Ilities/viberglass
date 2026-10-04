import type { RunnerModelEndpointResolver } from "../modelEndpoints/RunnerModelEndpointResolver";
import {
  isSecretHeader,
  MCP_HEADER_ENV_VAR_PREFIX,
  type Clanker,
  type McpServer,
  type SecretBinding,
  type WorkerMcpServer,
  type WorkerMcpServerHeader,
  type WorkerSkill,
  type WorkerModelEndpoint,
} from "@viberglass/types";
import { McpServerDAO } from "../../persistence/mcpServer/McpServerDAO";
import { SkillDAO } from "../../persistence/skill/SkillDAO";

/** What a run gets from its runner's MCP servers and skills. */
export interface RunnerTools {
  modelEndpoint?: WorkerModelEndpoint;
  mcpServers: WorkerMcpServer[];
  skills: WorkerSkill[];
  /** The secrets in MCP server headers, under env vars the worker keeps from the agent. */
  secretBindings: SecretBinding[];
}

function toWorkerServer(server: McpServer, serverIndex: number, bindings: SecretBinding[]): WorkerMcpServer {
  const headers = server.headers.map((header, headerIndex): WorkerMcpServerHeader => {
    if (!isSecretHeader(header)) return header;
    const envVar = `${MCP_HEADER_ENV_VAR_PREFIX}${serverIndex}_${headerIndex}`;
    bindings.push({ envVar, secretId: header.secretId });
    return { name: header.name, envVar, ...(header.prefix ? { prefix: header.prefix } : {}) };
  });
  return { name: server.name, url: server.url, headers };
}

/**
 * Turns the runner's picked MCP servers and skills into what its worker
 * needs. Secret header values never enter the payload: they travel like the
 * runner's other credentials, under env vars only the worker reads.
 */
export class RunnerToolResolver {
  constructor(
    private readonly servers: Pick<McpServerDAO, "getByIds"> = new McpServerDAO(),
    private readonly skills: Pick<SkillDAO, "getByIds"> = new SkillDAO(),
    private readonly modelEndpoints?: Pick<RunnerModelEndpointResolver, "resolve">,
  ) {}

  async resolve(clanker: Pick<Clanker, "mcpServerIds" | "skillIds" | "modelEndpoint" | "agent">): Promise<RunnerTools> {
    const [servers, skills] = await Promise.all([
      this.servers.getByIds(clanker.mcpServerIds ?? []),
      this.skills.getByIds(clanker.skillIds ?? []),
    ]);
    const model = await this.modelEndpoints?.resolve(clanker);
    if (clanker.modelEndpoint && !model) throw new Error("Model endpoint resolver is required");
    const secretBindings: SecretBinding[] = [...(model?.secretBindings ?? [])];
    return {
      ...(model?.endpoint ? { modelEndpoint: model.endpoint } : {}),
      mcpServers: servers.map((server, index) => toWorkerServer(server, index, secretBindings)),
      skills: skills.map((skill) => ({ id: skill.id, name: skill.name })),
      secretBindings,
    };
  }
}
