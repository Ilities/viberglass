import axios, { AxiosInstance } from "axios";
import { BasePMIntegration } from "@viberglass/integration-core";
import type { JiraConfig } from "./types";
import {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from "@viberglass/types";
import type { RawAxiosRequestHeaders } from "axios";

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
      id: string;
    };
    priority?: {
      name: string;
      id: string;
    };
    assignee?: {
      accountId: string;
      displayName: string;
      emailAddress?: string;
    };
    labels: string[];
    created: string;
    updated: string;
    issuetype: {
      name: string;
      id: string;
    };
    project: {
      key: string;
      id: string;
      name: string;
    };
  };
  self: string;
}

interface JiraWebhookEvent {
  webhookEvent: string;
  issue?: JiraIssue;
  changelog?: {
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
  timestamp: number;
  user?: {
    accountId: string;
    displayName: string;
  };
  comment?: {
    id: string;
    body: string;
    author: {
      accountId: string;
      displayName: string;
    };
  };
}

export class JiraIntegration extends BasePMIntegration {
  private config: JiraConfig;
  private apiClient: AxiosInstance = axios.create();
  private requestHeaders: RawAxiosRequestHeaders = {};

  constructor(credentials: AuthCredentials & JiraConfig) {
    super(credentials);
    this.config = credentials;
    this.setupApiClient();
  }

  private setupApiClient() {
    const baseURL = this.config.instanceUrl.replace(/\/$/, "");

    const headers: RawAxiosRequestHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "viberglass-receiver/1.0",
    };

    // Support different auth types
    if (this.config.token) {
      // API token (for cloud) or Personal Access Token (for server/data center)
      headers["Authorization"] = `Bearer ${this.config.token}`;
    } else if (this.config.username && this.config.password) {
      // Basic auth (username + API token for cloud, or username + password for server)
      const auth = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
    }

    this.requestHeaders = headers;

    this.apiClient = axios.create({
      baseURL: `${baseURL}/rest/api/2`,
      headers,
    });
  }

  async authenticate(credentials: AuthCredentials): Promise<void> {
    try {
      this.config = { ...this.config, ...credentials } as JiraConfig;
      this.setupApiClient();

      // Test authentication by getting current user info
      await this.apiClient.get("/myself");
    } catch (error) {
      throw new Error(`Jira authentication failed: ${error}`);
    }
  }

  async createTicket(ticket: Ticket): Promise<ExternalTicket> {
    try {
      const labels = [
        "bug",
        this.getLabelFromCategory(ticket.category),
        `severity:${ticket.severity}`,
      ];

      if (this.shouldEnableAutoFix(ticket)) {
        labels.push("auto-fix");
      }

      const issueData = {
        fields: {
          project: {
            key: this.config.projectKey,
          },
          summary: ticket.title,
          description: this.formatBugReportDescription(ticket),
          issuetype: this.config.issueTypeId
            ? { id: this.config.issueTypeId }
            : { name: "Bug" },
          labels: labels,
        },
      };

      const response = await this.apiClient.post("/issue", issueData);
      const issueKey = response.data.key;

      // Fetch the full issue to get all fields
      const issueResponse = await this.apiClient.get(`/issue/${issueKey}`);
      const issue: JiraIssue = issueResponse.data;

      return this.mapJiraIssueToTicket(issue);
    } catch (error) {
      throw new Error(`Failed to create Jira issue: ${error}`);
    }
  }

  async updateTicket(
    ticketId: string,
    updates: ExternalTicketUpdate,
  ): Promise<void> {
    try {
      const updateData: { fields: Record<string, unknown> } = {
        fields: {},
      };

      if (updates.title) {
        updateData.fields.summary = updates.title;
      }

      if (updates.description) {
        updateData.fields.description = updates.description;
      }

      if (updates.status) {
        // For status updates, we need to do a transition
        // First, get available transitions
        const transitionsResponse = await this.apiClient.get(
          `/issue/${ticketId}/transitions`,
        );
        const transitions = transitionsResponse.data.transitions;

        // Find a transition that matches the desired status
        const transition = transitions.find(
          (t: { to: { name: string } }) =>
            t.to.name.toLowerCase() === updates.status?.toLowerCase(),
        );

        if (transition) {
          await this.apiClient.post(`/issue/${ticketId}/transitions`, {
            transition: { id: transition.id },
          });
        }
      }

      if (updates.labels) {
        updateData.fields.labels = updates.labels;
      }

      if (updates.priority) {
        updateData.fields.priority = { name: updates.priority };
      }

      if (updates.assignee) {
        updateData.fields.assignee = { accountId: updates.assignee };
      }

      if (Object.keys(updateData.fields).length > 0) {
        await this.apiClient.put(`/issue/${ticketId}`, updateData);
      }

      // Add comment if provided
      if (updates.comment) {
        await this.apiClient.post(`/issue/${ticketId}/comment`, {
          body: updates.comment,
        });
      }
    } catch (error) {
      throw new Error(`Failed to update Jira issue: ${error}`);
    }
  }

  async getTicket(ticketId: string): Promise<ExternalTicket> {
    try {
      const response = await this.apiClient.get(`/issue/${ticketId}`);
      const issue: JiraIssue = response.data;

      return this.mapJiraIssueToTicket(issue);
    } catch (error) {
      throw new Error(`Failed to get Jira issue: ${error}`);
    }
  }

  async registerWebhook(url: string, events: string[]): Promise<void> {
    try {
      // Map generic events to Jira webhook events
      const jiraEvents: string[] = [];

      for (const event of events) {
        switch (event) {
          case "issue_created":
            jiraEvents.push("jira:issue_created");
            break;
          case "issue_updated":
            jiraEvents.push("jira:issue_updated");
            break;
          case "issue_deleted":
            jiraEvents.push("jira:issue_deleted");
            break;
          case "comment_created":
            jiraEvents.push("comment_created");
            break;
          default:
            jiraEvents.push(event);
        }
      }

      const webhookData = {
        name: "viberglass",
        url: url,
        events: jiraEvents,
        filters: {
          "issue-related-events-section": this.config.projectKey
            ? `project = ${this.config.projectKey}`
            : undefined,
        },
        enabled: true,
      };

      // Jira webhooks are registered via a different endpoint
      const baseURL = this.config.instanceUrl.replace(/\/$/, "");
      await axios.post(`${baseURL}/rest/webhooks/1.0/webhook`, webhookData, {
        headers: this.requestHeaders,
      });
    } catch (error) {
      throw new Error(`Failed to register Jira webhook: ${error}`);
    }
  }

  handleWebhook(payload: JiraWebhookEvent): WebhookEvent {
    const eventType = payload.webhookEvent;
    const issue = payload.issue;

    if (!issue) {
      throw new Error("Invalid webhook payload: missing issue data");
    }

    let webhookType:
      | "ticket_created"
      | "ticket_updated"
      | "ticket_deleted"
      | "comment_added";

    switch (eventType) {
      case "jira:issue_created":
        webhookType = "ticket_created";
        break;
      case "jira:issue_deleted":
        webhookType = "ticket_deleted";
        break;
      case "comment_created":
        webhookType = "comment_added";
        break;
      case "jira:issue_updated":
      default:
        webhookType = "ticket_updated";
        break;
    }

    const ticket = this.mapJiraIssueToTicket(issue);

    // Build changes object from changelog
    const changes: Record<string, unknown> = {};
    if (payload.changelog?.items) {
      for (const item of payload.changelog.items) {
        changes[item.field] = {
          from: item.fromString,
          to: item.toString,
        };
      }
    }

    return {
      type: webhookType,
      ticketId: issue.key,
      ticket,
      changes,
      timestamp: new Date(payload.timestamp).toISOString(),
      source: "jira",
    };
  }

  private mapJiraIssueToTicket(issue: JiraIssue): ExternalTicket {
    const fields = issue.fields;

    return {
      id: issue.key,
      title: fields.summary,
      description: fields.description || "",
      status: fields.status.name,
      priority: fields.priority?.name || "Medium",
      assignee: fields.assignee?.accountId || fields.assignee?.displayName,
      labels: fields.labels || [],
      customFields: {
        jiraId: issue.id,
        jiraKey: issue.key,
        issueTypeId: fields.issuetype.id,
        issueTypeName: fields.issuetype.name,
        projectId: fields.project.id,
        projectName: fields.project.name,
      },
      createdAt: fields.created,
      updatedAt: fields.updated,
      url: `${this.config.instanceUrl}/browse/${issue.key}`,
      projectKey: fields.project.key,
    };
  }

  protected formatBugReportDescription(ticket: Ticket): string {
    let description = super.formatBugReportDescription(ticket);

    // Add media assets in Jira's wiki markup format
    description += `\nh2. Media Assets\n\n`;
    if (ticket.screenshot) {
      description += `*Screenshot:* [${ticket.screenshot.url}|${ticket.screenshot.url}]\n`;
    }
    if (ticket.recording) {
      description += `*Recording:* [${ticket.recording.url}|${ticket.recording.url}]\n`;
    }

    if (ticket.annotations.length > 0) {
      description += `\n*Annotations:* ${ticket.annotations.length} annotation(s) available\n`;
    }

    return description;
  }

  // Jira-specific methods
  async getProjectInfo(): Promise<{
    id: string;
    key: string;
    name: string;
    issueTypes: Array<{ id: string; name: string }>;
  }> {
    try {
      const response = await this.apiClient.get(
        `/project/${this.config.projectKey}`,
      );
      const project = response.data;

      // Get issue types for the project
      const metaResponse = await this.apiClient.get(
        `/issue/createmeta?projectKeys=${this.config.projectKey}&expand=projects.issuetypes`,
      );

      const projectMeta = metaResponse.data.projects[0];
      const issueTypes =
        projectMeta?.issuetypes?.map((t: { id: string; name: string }) => ({
          id: t.id,
          name: t.name,
        })) || [];

      return {
        id: project.id,
        key: project.key,
        name: project.name,
        issueTypes,
      };
    } catch (error) {
      throw new Error(`Failed to get Jira project info: ${error}`);
    }
  }

  async getTransitions(
    issueKey: string,
  ): Promise<
    Array<{ id: string; name: string; to: { id: string; name: string } }>
  > {
    try {
      const response = await this.apiClient.get(
        `/issue/${issueKey}/transitions`,
      );
      return response.data.transitions;
    } catch (error) {
      throw new Error(`Failed to get Jira transitions: ${error}`);
    }
  }

  async addAttachment(
    issueKey: string,
    fileBuffer: Buffer,
    filename: string,
  ): Promise<void> {
    try {
      const FormData = (await import("form-data")).default;
      const form = new FormData();
      form.append("file", fileBuffer, { filename });

      await this.apiClient.post(`/issue/${issueKey}/attachments`, form, {
        headers: {
          ...form.getHeaders(),
          "X-Atlassian-Token": "no-check",
        },
      });
    } catch (error) {
      throw new Error(`Failed to add Jira attachment: ${error}`);
    }
  }
}
