import type { Integration } from "@viberglass/types";
import { fakeChatProvider } from "../../../helpers/fakeChatProvider";
import { SetupNextStepsService } from "../../../../services/setup/SetupNextStepsService";

const integration = (system: Integration["system"]): Integration => ({
  id: `int-${system}`,
  name: system,
  system,
  config: {},
  isActive: true,
  createdAt: "2026-09-30T10:00:00Z",
  updatedAt: "2026-09-30T10:00:00Z",
});

function service(options: { users: number; invites: number; integrations: Integration[]; chatConfigured?: boolean; demoUsers?: number }) {
  return new SetupNextStepsService({
    users: { listUsers: jest.fn().mockResolvedValue(Array.from({ length: options.users }, (_, i) => ({ id: `u-${i}` }))) },
    invites: { listOpen: jest.fn().mockResolvedValue(Array.from({ length: options.invites }, (_, i) => ({ id: `i-${i}` }))) },
    demo: {
      list: jest.fn().mockResolvedValue(
        Array.from({ length: options.demoUsers ?? 0 }, (_, i) => ({ entityType: "user", entityId: `u-${options.users - 1 - i}` })),
      ),
    },
    integrations: { listIntegrations: jest.fn().mockResolvedValue(options.integrations) },
    isTicketingSystem: (system) => system === "jira",
    chatServices: () => [{ system: "slack", label: "Slack", provider: fakeChatProvider({ configured: Boolean(options.chatConfigured) }) }],
  });
}

describe("SetupNextStepsService", () => {
  it("leaves everything to do on a workspace fresh from setup", async () => {
    await expect(service({ users: 1, invites: 0, integrations: [integration("github")] }).getNextSteps()).resolves.toEqual({
      teamInvited: false,
      chatConnected: false,
      chatSystem: "slack",
      trackerConnected: false,
    });
  });

  it("ticks each item from real state", async () => {
    await expect(
      service({ users: 1, invites: 1, integrations: [integration("slack"), integration("jira")] }).getNextSteps(),
    ).resolves.toEqual({ teamInvited: true, chatConnected: true, chatSystem: "slack", trackerConnected: true });
  });

  it("counts an accepted invite, once the invitee has an account", async () => {
    await expect(service({ users: 2, invites: 0, integrations: [] }).getNextSteps()).resolves.toMatchObject({ teamInvited: true });
  });

  it("doesn't count the demo workspace's people as a team", async () => {
    await expect(service({ users: 4, demoUsers: 3, invites: 0, integrations: [] }).getNextSteps()).resolves.toMatchObject({ teamInvited: false });
  });

  it("counts a chat service set up in the environment, with no connection saved", async () => {
    await expect(service({ users: 1, invites: 0, integrations: [], chatConfigured: true }).getNextSteps()).resolves.toMatchObject({
      chatConnected: true,
    });
  });
});
