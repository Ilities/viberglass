import { CredentialExpiryWarner } from "../../../../services/notifications/CredentialExpiryWarner";

const NOW = new Date("2026-10-02T09:00:00.000Z");

describe("CredentialExpiryWarner", () => {
  it("warns every admin once, a week ahead, with a link to the connection", async () => {
    const channel = { name: "test", deliver: jest.fn().mockResolvedValue(undefined) };
    const deps = {
      credentials: {
        listUnwarnedExpiringBefore: jest.fn().mockResolvedValue([
          { id: "c-1", name: "Deploy token", integrationId: "i-1", integrationName: "GitHub", expiresAt: new Date("2026-10-05T00:00:00.000Z") },
        ]),
        markWarned: jest.fn().mockResolvedValue(undefined),
      },
      users: { listActiveAdminIds: jest.fn().mockResolvedValue(["u-a", "u-b"]) },
      channels: [channel],
      frontendUrl: "https://vg.example.com/",
    };

    expect(await new CredentialExpiryWarner(deps).warn(NOW)).toBe(1);
    expect(deps.credentials.listUnwarnedExpiringBefore).toHaveBeenCalledWith(new Date("2026-10-09T09:00:00.000Z"), NOW);
    expect(channel.deliver).toHaveBeenCalledTimes(2);
    expect(channel.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "u-a",
        kind: "credential_expiring",
        text: "The “Deploy token” credential for GitHub expires on 2026-10-05. Replace it before then, or runs that use it will stop.",
        link: "https://vg.example.com/settings/connections/i-1",
      }),
    );
    expect(deps.credentials.markWarned).toHaveBeenCalledWith("c-1");
  });

  it("still marks it warned when a channel fails", async () => {
    const deps = {
      credentials: {
        listUnwarnedExpiringBefore: jest.fn().mockResolvedValue([{ id: "c-1", name: "T", integrationId: "i", integrationName: "G", expiresAt: NOW }]),
        markWarned: jest.fn().mockResolvedValue(undefined),
      },
      users: { listActiveAdminIds: jest.fn().mockResolvedValue(["u-a"]) },
      channels: [{ name: "broken", deliver: jest.fn().mockRejectedValue(new Error("Slack is down")) }],
      frontendUrl: undefined,
    };
    await new CredentialExpiryWarner(deps).warn(NOW);
    expect(deps.credentials.markWarned).toHaveBeenCalledWith("c-1");
  });
});
