import type { Integration } from "@viberglass/types";
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

function service(options: { users: number; invites: number; integrations: Integration[] }) {
  return new SetupNextStepsService({
    users: { listUsers: jest.fn().mockResolvedValue(Array.from({ length: options.users }, (_, i) => ({ id: `u-${i}` }))) },
    invites: { listOpen: jest.fn().mockResolvedValue(Array.from({ length: options.invites }, (_, i) => ({ id: `i-${i}` }))) },
    integrations: { listIntegrations: jest.fn().mockResolvedValue(options.integrations) },
    isTicketingSystem: (system) => system === "jira",
  });
}

describe("SetupNextStepsService", () => {
  it("leaves everything to do on a workspace fresh from setup", async () => {
    await expect(service({ users: 1, invites: 0, integrations: [integration("github")] }).getNextSteps()).resolves.toEqual({
      teamInvited: false,
      slackConnected: false,
      trackerConnected: false,
    });
  });

  it("ticks each item from real state", async () => {
    await expect(
      service({ users: 1, invites: 1, integrations: [integration("slack"), integration("jira")] }).getNextSteps(),
    ).resolves.toEqual({ teamInvited: true, slackConnected: true, trackerConnected: true });
  });

  it("counts an accepted invite, once the invitee has an account", async () => {
    await expect(service({ users: 2, invites: 0, integrations: [] }).getNextSteps()).resolves.toMatchObject({ teamInvited: true });
  });
});
