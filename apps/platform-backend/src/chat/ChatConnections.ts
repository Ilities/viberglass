import type { AuthCredentials } from "@viberglass/types";
import { ConnectionVersionDAO } from "../persistence/integrations/ConnectionVersionDAO";
import { IntegrationDAO } from "../persistence/integrations/IntegrationDAO";
import { ConnectionCredentialsResolver } from "../services/trackers/ConnectionCredentialsResolver";

/**
 * The connection a chat service runs on: its integration's newest active one.
 * A workspace has one bot per chat service, so older connections are unused.
 */
export class ChatConnections {
  constructor(
    private readonly versions: Pick<ConnectionVersionDAO, "newestActive"> = new ConnectionVersionDAO(),
    private readonly integrations: Pick<IntegrationDAO, "getIntegration"> = new IntegrationDAO(),
    private readonly resolver: Pick<ConnectionCredentialsResolver, "resolve"> = new ConnectionCredentialsResolver(),
  ) {}

  /** Changes whenever the connection, its credentials or their values do; null without one. */
  async version(system: string): Promise<string | null> {
    return (await this.versions.newestActive(system))?.version ?? null;
  }

  /** The connection's settings with its credentials filled in; null without one. */
  async credentials(system: string): Promise<AuthCredentials | null> {
    const newest = await this.versions.newestActive(system);
    const integration = newest ? await this.integrations.getIntegration(newest.id) : null;
    return integration ? this.resolver.resolve(integration) : null;
  }
}
