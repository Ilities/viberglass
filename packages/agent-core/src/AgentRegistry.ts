import { Logger } from "winston";
import type { AgentPlugin } from "./AgentPlugin";
import type { BaseAgentConfig } from "./types";
import type { BaseAgent } from "./BaseAgent";
import type { AcpEventMapper } from "./acp/acpEventMapperTypes";
import { defaultAcpEventMapper } from "./acp/acpEventMapper";
import type { IAgentGitService } from "./git/IAgentGitService";

export class AgentRegistry {
  private readonly plugins = new Map<string, AgentPlugin>();

  register(plugin: AgentPlugin): this {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Duplicate agent plugin: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
    return this;
  }

  get(id: string): AgentPlugin {
    const p = this.plugins.get(id);
    if (!p) throw new Error(`Unknown agent: ${id}`);
    return p;
  }

  tryGet(id: string): AgentPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): AgentPlugin[] {
    return [...this.plugins.values()];
  }

  createAgent(config: BaseAgentConfig, logger: Logger, gitService?: IAgentGitService): BaseAgent {
    return this.get(config.name).create(config, logger, gitService);
  }

  getAcpEventMapper(id: string): AcpEventMapper {
    return this.tryGet(id)?.acpEventMapper ?? defaultAcpEventMapper;
  }

  getDefaultConfigs(): Record<string, unknown> {
    return Object.fromEntries(
      this.list().map((p) => [p.id, { name: p.id, ...p.defaultConfig }]),
    );
  }

  getEnvAliases(): Record<string, { apiKey?: string[]; endpoint?: string[] }> {
    return Object.fromEntries(
      this.list()
        .filter((p) => p.envAliases)
        .map((p) => [p.id, p.envAliases!]),
    );
  }

  getStateDirs(): Record<string, string> {
    return Object.fromEntries(
      this.list()
        .filter((p) => p.stateDir)
        .map((p) => [p.id, p.stateDir!]),
    );
  }

  getHarnessConfigPatterns(): string[] {
    return this.list().flatMap((p) => p.harnessConfigPatterns ?? []);
  }

  /**
   * Find the plugin whose harnessConfigPatterns include the given relative path,
   * so callers can invoke its materializeHarnessConfig hook.
   */
  findByHarnessConfigPath(relativePath: string): AgentPlugin | undefined {
    const normalized = relativePath.replace(/\\/g, "/");
    return this.list().find((p) =>
      (p.harnessConfigPatterns ?? []).some(
        (pattern) =>
          normalized === pattern || normalized.endsWith("/" + pattern),
      ),
    );
  }
}
