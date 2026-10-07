import type { Integration, SetupNextSteps, TicketSystem } from "@viberglass/types";
import { DemoSeedRecordDAO } from "../../persistence/demo/DemoSeedRecordDAO";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { InviteDAO } from "../../persistence/user/InviteDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { SlackWebApi } from "../notifications/SlackWebApi";

interface Dependencies {
  users: Pick<UserDAO, "listUsers">;
  invites: Pick<InviteDAO, "listOpen">;
  demo: Pick<DemoSeedRecordDAO, "list">;
  integrations: Pick<IntegrationDAO, "listIntegrations">;
  isTicketingSystem: (system: TicketSystem) => boolean;
  slack: Pick<SlackWebApi, "isConfigured">;
}

const defaults = (): Dependencies => ({
  users: new UserDAO(),
  invites: new InviteDAO(),
  demo: new DemoSeedRecordDAO(),
  integrations: new IntegrationDAO(),
  isTicketingSystem: (system) => integrationRegistry.get(system)?.category === "ticketing",
  slack: new SlackWebApi(),
});

/** What's left after setup (invite the team, connect Slack, connect a tracker). */
export class SetupNextStepsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getNextSteps(): Promise<SetupNextSteps> {
    const [users, invites, demo, integrations] = await Promise.all([
      this.deps.users.listUsers(),
      this.deps.invites.listOpen(),
      this.deps.demo.list(),
      this.deps.integrations.listIntegrations(),
    ]);
    // The demo workspace's made-up people aren't a team.
    const demoUsers = new Set(demo.flatMap((record) => (record.entityType === "user" ? [record.entityId] : [])));
    const people = users.filter((user) => !demoUsers.has(user.id));
    return {
      teamInvited: people.length > 1 || invites.length > 0,
      // Slack can be set up by its bot token in the environment, with no connection saved.
      slackConnected:
        this.deps.slack.isConfigured() || integrations.some((integration: Integration) => integration.system === "slack"),
      trackerConnected: integrations.some((integration: Integration) => this.deps.isTicketingSystem(integration.system)),
    };
  }
}
