import type { TrackerCommenter } from "@viberglass/integration-core";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import type { TaskIssueLink } from "../../persistence/ticketing/TaskIssueLinkDAO";
import { ConnectionCredentialsResolver } from "./ConnectionCredentialsResolver";

/** Posts to a linked issue with the connection it came through; null when that connection is gone or can't post. */
export class TrackerCommenterResolver {
  constructor(
    private readonly integrations: Pick<IntegrationDAO, "getIntegration"> = new IntegrationDAO(),
    private readonly credentials: Pick<ConnectionCredentialsResolver, "resolve"> = new ConnectionCredentialsResolver(),
    private readonly plugins: Pick<typeof integrationRegistry, "get"> = integrationRegistry,
  ) {}

  async resolve(link: Pick<TaskIssueLink, "integrationId">): Promise<TrackerCommenter | null> {
    if (!link.integrationId) return null;
    const integration = await this.integrations.getIntegration(link.integrationId);
    const plugin = integration ? this.plugins.get(integration.system) : undefined;
    if (!integration || !plugin?.createCommenter) return null;
    return plugin.createCommenter(await this.credentials.resolve(integration));
  }
}
