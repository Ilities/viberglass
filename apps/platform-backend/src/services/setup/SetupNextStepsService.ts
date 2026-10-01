import type { Integration, SetupNextSteps, TicketSystem } from "@viberglass/types";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { InviteDAO } from "../../persistence/user/InviteDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";

interface Dependencies {
  users: Pick<UserDAO, "listUsers">;
  invites: Pick<InviteDAO, "listOpen">;
  integrations: Pick<IntegrationDAO, "listIntegrations">;
  isTicketingSystem: (system: TicketSystem) => boolean;
}

const defaults = (): Dependencies => ({
  users: new UserDAO(),
  invites: new InviteDAO(),
  integrations: new IntegrationDAO(),
  isTicketingSystem: (system) => integrationRegistry.get(system)?.category === "ticketing",
});

/** J1 step 7: what's left after setup (invite the team, connect Slack, connect a tracker). */
export class SetupNextStepsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getNextSteps(): Promise<SetupNextSteps> {
    const [users, invites, integrations] = await Promise.all([
      this.deps.users.listUsers(),
      this.deps.invites.listOpen(),
      this.deps.integrations.listIntegrations(),
    ]);
    return {
      teamInvited: users.length > 1 || invites.length > 0,
      slackConnected: integrations.some((integration: Integration) => integration.system === "slack"),
      trackerConnected: integrations.some((integration: Integration) => this.deps.isTicketingSystem(integration.system)),
    };
  }
}
