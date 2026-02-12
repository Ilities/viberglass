import crypto from "crypto";
import axios from "axios";
import { GitHubWebhookProvider } from "../../../../webhooks/providers/GitHubWebhookProvider";

jest.mock("axios");

describe("GitHubWebhookProvider", () => {
  let provider: GitHubWebhookProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GitHubWebhookProvider({
      type: "github",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["issues.opened", "issue_comment.created"],
      webhookSecret: "secret",
      apiToken: "token",
      providerProjectId: "acme/repo",
    });
  });

  it("parses issues webhook as an action-scoped event", () => {
    const event = provider.parseEvent(
      {
        action: "opened",
        issue: {
          number: 42,
          title: "Broken flow",
          state: "open",
          html_url: "https://github.com/acme/repo/issues/42",
          user: { login: "alice" },
          created_at: "2026-02-10T00:00:00.000Z",
          updated_at: "2026-02-10T00:00:00.000Z",
        },
        repository: {
          id: 1,
          name: "repo",
          full_name: "acme/repo",
          owner: { login: "acme" },
          private: false,
        },
        sender: { login: "alice", id: 7 },
      },
      {
        "x-github-event": "issues",
        "x-github-delivery": "delivery-1",
      },
    );

    expect(event.eventType).toBe("issues.opened");
    expect(event.deduplicationId).toBe("delivery-1");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: "acme/repo",
        issueKey: "42",
        action: "opened",
        sender: "alice",
      }),
    );
  });

  it("parses issue_comment webhook as an action-scoped event", () => {
    const event = provider.parseEvent(
      {
        action: "created",
        issue: {
          number: 42,
          title: "Broken flow",
          state: "open",
          html_url: "https://github.com/acme/repo/issues/42",
          user: { login: "alice" },
          created_at: "2026-02-10T00:00:00.000Z",
          updated_at: "2026-02-10T00:00:00.000Z",
        },
        comment: {
          id: 99,
          body: "@viberator fix this",
          user: { login: "bob" },
          created_at: "2026-02-10T00:00:00.000Z",
          updated_at: "2026-02-10T00:00:00.000Z",
        },
        repository: {
          id: 1,
          name: "repo",
          full_name: "acme/repo",
          owner: { login: "acme" },
          private: false,
        },
        sender: { login: "bob", id: 9 },
      },
      {
        "x-github-event": "issue_comment",
        "x-github-delivery": "delivery-2",
      },
    );

    expect(event.eventType).toBe("issue_comment.created");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: "acme/repo",
        issueKey: "42",
        commentId: "99",
        action: "created",
        sender: "bob",
      }),
    );
  });

  it("enforces required payload fields for supported events", () => {
    expect(() =>
      provider.parseEvent(
        {
          action: "opened",
          issue: { number: 42 },
        },
        {
          "x-github-event": "issues",
          "x-github-delivery": "delivery-3",
        },
      ),
    ).toThrow("Missing required field 'repository.full_name'");
  });

  it("verifies valid HMAC signatures against raw bytes", () => {
    const rawBody = Buffer.from('{"action":"opened"}');
    const secret = "super-secret";
    const signature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")}`;

    expect(provider.verifySignature(rawBody, signature, secret)).toBe(true);
    expect(provider.verifySignature(rawBody, signature, "wrong-secret")).toBe(
      false,
    );
  });

  it("updates labels against current issue labels without clobbering unrelated labels", async () => {
    const client = {
      get: jest.fn().mockResolvedValue({
        data: {
          labels: [
            { name: "bug" },
            { name: "Fix-Submitted" },
            { name: "needs-triage" },
          ],
        },
      }),
      put: jest.fn().mockResolvedValue({}),
      post: jest.fn(),
      patch: jest.fn(),
    };

    (axios.create as jest.Mock).mockReturnValue(client as any);

    await provider.updateLabels("42", ["fix-failed"], ["fix-submitted"]);

    expect(client.get).toHaveBeenCalledWith("/repos/acme/repo/issues/42");
    expect(client.put).toHaveBeenCalledWith(
      "/repos/acme/repo/issues/42/labels",
      expect.objectContaining({
        labels: expect.arrayContaining(["bug", "needs-triage", "fix-failed"]),
      }),
    );

    const putPayload = client.put.mock.calls[0][1] as { labels: string[] };
    expect(putPayload.labels).not.toContain("Fix-Submitted");
  });
});
