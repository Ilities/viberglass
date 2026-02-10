import crypto from "crypto";
import axios from "axios";
import { JiraWebhookProvider } from "../../../../webhooks/providers/JiraWebhookProvider";

jest.mock("axios");

describe("JiraWebhookProvider", () => {
  let provider: JiraWebhookProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new JiraWebhookProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["issue_created", "comment_created"],
      webhookSecret: "secret",
      apiToken: "token",
      providerProjectId: "PROJ",
      apiBaseUrl: "https://jira.example.com",
    });
  });

  it("parses issue_created events with Jira project and reporter metadata", () => {
    const timestamp = Date.parse("2026-02-10T10:00:00.000Z");
    const event = provider.parseEvent(
      {
        webhookEvent: "jira:issue_created",
        timestamp,
        issue: {
          key: "PROJ-123",
          fields: {
            summary: "Broken login",
            issuetype: {
              id: "10000",
              name: "Bug",
            },
            project: {
              id: "10001",
              key: "PROJ",
            },
            reporter: {
              accountId: "abc",
              displayName: "Alice Reporter",
            },
            status: {
              id: "3",
              name: "To Do",
            },
            created: "2026-02-10T10:00:00.000Z",
            updated: "2026-02-10T10:00:00.000Z",
          },
        },
        user: {
          self: "https://jira.example.com/user/abc",
          accountId: "abc",
          displayName: "Alice Reporter",
        },
      },
      {
        "x-atlassian-webhook-identifier": "jira-delivery-1",
      },
    );

    expect(event.eventType).toBe("issue_created");
    expect(event.deduplicationId).toBe("jira-delivery-1");
    expect(event.timestamp).toBe("2026-02-10T10:00:00.000Z");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: "PROJ",
        projectId: "10001",
        issueKey: "PROJ-123",
        sender: "Alice Reporter",
      }),
    );
  });

  it("normalizes Jira issue_commented updates to comment_created", () => {
    const event = provider.parseEvent(
      {
        webhookEvent: "jira:issue_updated",
        issue_event_type_name: "issue_commented",
        timestamp: Date.parse("2026-02-10T10:00:00.000Z"),
        issue: {
          key: "OPS-42",
          fields: {
            summary: "Service outage",
            issuetype: {
              id: "10000",
              name: "Bug",
            },
            reporter: {
              accountId: "rep-1",
              displayName: "Reporter",
            },
            project: {
              key: "OPS",
            },
            status: {
              id: "1",
              name: "Open",
            },
            created: "2026-02-10T10:00:00.000Z",
            updated: "2026-02-10T10:01:00.000Z",
          },
        },
        comment: {
          id: "9001",
          self: "https://jira.example.com/comment/9001",
          author: {
            accountId: "c-1",
            displayName: "Bob Commenter",
          },
          body: "please fix this",
          created: "2026-02-10T10:01:00.000Z",
          updated: "2026-02-10T10:01:00.000Z",
        },
      },
      {
        "x-atlassian-webhook-identifier": "jira-delivery-2",
      },
    );

    expect(event.eventType).toBe("comment_created");
    expect(event.metadata).toEqual(
      expect.objectContaining({
        repositoryId: "OPS",
        issueKey: "OPS-42",
        commentId: "9001",
        action: "issue_commented",
        sender: "Bob Commenter",
      }),
    );
  });

  it("throws when issue key is missing for supported Jira issue events", () => {
    expect(() =>
      provider.parseEvent(
        {
          webhookEvent: "jira:issue_created",
          issue: {
            fields: {
              summary: "Broken login",
              issuetype: {
                id: "10000",
                name: "Bug",
              },
              project: {
                key: "PROJ",
              },
              reporter: {
                accountId: "abc",
                displayName: "Alice Reporter",
              },
              status: {
                id: "3",
                name: "To Do",
              },
              created: "2026-02-10T10:00:00.000Z",
              updated: "2026-02-10T10:00:00.000Z",
            },
          },
        },
        {
          "x-atlassian-webhook-identifier": "jira-delivery-3",
        },
      ),
    ).toThrow("Missing required field 'issue.key'");
  });

  it("verifies valid HMAC signatures against raw bytes", () => {
    const rawBody = Buffer.from('{"webhookEvent":"jira:issue_created"}');
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

  it("rejects malformed Jira signatures", () => {
    const rawBody = Buffer.from('{"webhookEvent":"jira:issue_created"}');
    expect(provider.verifySignature(rawBody, "sha256=not-hex", "secret")).toBe(
      false,
    );
  });

  it("posts Jira comments as ADF and normalizes instance URLs to rest/api paths", async () => {
    const client = {
      post: jest.fn().mockResolvedValue({}),
      get: jest.fn(),
      put: jest.fn(),
    };
    (axios.create as jest.Mock).mockReturnValue(client);

    await provider.postComment(
      "OPS-42",
      "## 🚀 Job Started\n\n**Job ID:** job-1\n- step one",
    );

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://jira.example.com/rest/api/3",
      }),
    );
    expect(client.post).toHaveBeenCalledWith(
      "/issue/OPS-42/comment",
      expect.objectContaining({
        body: expect.objectContaining({
          type: "doc",
          version: 1,
        }),
      }),
    );

    const body = client.post.mock.calls[0][1].body as {
      content: Array<{ type: string; content?: Array<{ text?: string; marks?: Array<{ type: string }> }> }>;
    };
    expect(body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "heading" }),
        expect.objectContaining({ type: "bulletList" }),
      ]),
    );

    const paragraph = body.content.find((node) => node.type === "paragraph");
    expect(paragraph?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "Job ID:",
          marks: [{ type: "strong" }],
        }),
      ]),
    );
  });

  it("applies configured Jira labels and transition IDs when posting successful results", async () => {
    provider = new JiraWebhookProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["job_ended"],
      apiToken: "token",
      providerProjectId: "OPS",
      apiBaseUrl: "https://jira.example.com/rest/api/3/issue/OPS-42",
      labelMappings: {
        jira: {
          successLabel: "auto-fixed",
          failureLabel: "auto-failed",
          successTransitionId: "31",
        },
      },
    });

    const client = {
      post: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({
        data: {
          fields: {
            labels: ["triage", "auto-failed"],
          },
        },
      }),
      put: jest.fn().mockResolvedValue({}),
    };
    (axios.create as jest.Mock).mockReturnValue(client);

    await provider.postResult("OPS-42", {
      success: true,
      action: "comment",
      targetId: "OPS-42",
      details: "done",
    });

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://jira.example.com/rest/api/3",
      }),
    );
    expect(client.put).toHaveBeenCalledWith(
      "/issue/OPS-42",
      expect.objectContaining({
        fields: expect.objectContaining({
          labels: expect.arrayContaining(["triage", "auto-fixed"]),
        }),
      }),
    );

    const updatedLabels = client.put.mock.calls[0][1].fields.labels as string[];
    expect(updatedLabels).not.toContain("auto-failed");
    expect(client.post).toHaveBeenCalledWith("/issue/OPS-42/transitions", {
      transition: { id: "31" },
    });
  });

  it("supports optional Jira status transition by name without label changes", async () => {
    provider = new JiraWebhookProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["job_ended"],
      apiToken: "token",
      providerProjectId: "OPS",
      apiBaseUrl: "https://jira.example.com",
      labelMappings: {
        jira: {
          updateLabels: false,
          successStatus: "Done",
        },
      },
    });

    const client = {
      post: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({
        data: {
          transitions: [
            {
              id: "91",
              to: { name: "Done" },
            },
          ],
        },
      }),
      put: jest.fn().mockResolvedValue({}),
    };
    (axios.create as jest.Mock).mockReturnValue(client);

    await provider.postResult("OPS-42", {
      success: true,
      action: "comment",
      targetId: "OPS-42",
      details: "done",
    });

    expect(client.put).not.toHaveBeenCalled();
    expect(client.get).toHaveBeenCalledWith("/issue/OPS-42/transitions");
    expect(client.post).toHaveBeenCalledWith("/issue/OPS-42/transitions", {
      transition: { id: "91" },
    });
  });
});
