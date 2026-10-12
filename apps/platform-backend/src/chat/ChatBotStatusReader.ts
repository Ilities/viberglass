import type { IntegrationRegistry } from "@viberglass/integration-core";
import type { ChatBotStatus } from "@viberglass/types";
import type { ChatConnections } from "./ChatConnections";

interface Dependencies {
  /** Brings the bot up to date with the connections first. */
  refresh: () => Promise<void>;
  plugins: Pick<IntegrationRegistry, "get">;
  connections: Pick<ChatConnections, "credentials">;
}

/** Whether a chat service's bot runs, and if the service turns its credentials down, why. */
export class ChatBotStatusReader {
  constructor(private readonly deps: Dependencies) {}

  async status(system: string): Promise<ChatBotStatus> {
    await this.deps.refresh();
    const plugin = this.deps.plugins.get(system);
    if (!plugin?.chat?.isConfigured()) return { configured: false };
    if (!plugin.checkConnection) return { configured: true };

    const credentials = await this.deps.connections.credentials(system);
    if (!credentials) return { configured: false };
    try {
      await plugin.checkConnection(credentials);
      return { configured: true };
    } catch (error) {
      return { configured: true, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
