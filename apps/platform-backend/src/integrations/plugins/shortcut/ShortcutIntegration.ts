import axios from "axios";
import { BasePMIntegration } from "../../BasePMIntegration";
import { ShortcutConfig } from "../../../models/PMIntegration";
import {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from "@viberglass/types";

interface ShortcutLabel {
  name: string;
}

interface ShortcutStory {
  id: number;
  name: string;
  description?: string;
  workflow_state_id?: number;
  workflow_state_name?: string;
  workflow_state_type?: string;
  labels?: ShortcutLabel[];
  owner_ids?: number[];
  app_url?: string;
  created_at: string;
  updated_at: string;
  project_id?: number;
}

export class ShortcutIntegration extends BasePMIntegration {
  private config: ShortcutConfig;
  private apiClient: any;

  constructor(credentials: AuthCredentials & ShortcutConfig) {
    super(credentials);
    this.config = credentials;
    this.setupApiClient();
  }

  private getApiToken(): string {
    return this.config.apiKey || this.config.token || "";
  }

  private parseNumericId(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private setupApiClient() {
    this.apiClient = axios.create({
      baseURL: this.config.baseUrl || "https://api.app.shortcut.com/api/v3",
      headers: {
        "Shortcut-Token": this.getApiToken(),
        "Content-Type": "application/json",
        "User-Agent": "viberglass-receiver/1.0",
      },
    });
  }

  async authenticate(credentials: AuthCredentials): Promise<void> {
    try {
      this.config = { ...this.config, ...credentials } as ShortcutConfig;
      this.setupApiClient();

      await this.apiClient.get("/member");
    } catch (error) {
      throw new Error(`Shortcut authentication failed: ${error}`);
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

      const storyData: any = {
        name: ticket.title,
        description: this.formatBugReportDescription(ticket),
        story_type: "bug",
        labels: labels.map((name) => ({ name })),
      };

      const projectId = this.parseNumericId(this.config.projectId);
      if (projectId) {
        storyData.project_id = projectId;
      }

      const workflowStateId = this.parseNumericId(this.config.workflowStateId);
      if (workflowStateId) {
        storyData.workflow_state_id = workflowStateId;
      }

      const response = await this.apiClient.post("/stories", storyData);
      const story: ShortcutStory = response.data;

      return this.mapShortcutStoryToTicket(story);
    } catch (error) {
      throw new Error(`Failed to create Shortcut story: ${error}`);
    }
  }

  async updateTicket(
    ticketId: string,
    updates: ExternalTicketUpdate,
  ): Promise<void> {
    try {
      const updateData: any = {};

      if (updates.title) {
        updateData.name = updates.title;
      }

      if (updates.description) {
        updateData.description = updates.description;
      }

      if (updates.labels) {
        updateData.labels = updates.labels.map((name) => ({ name }));
      }

      if (updates.status) {
        const workflowStateId = this.parseNumericId(updates.status);
        if (workflowStateId) {
          updateData.workflow_state_id = workflowStateId;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await this.apiClient.put(`/stories/${ticketId}`, updateData);
      }

      if (updates.comment) {
        await this.apiClient.post(`/stories/${ticketId}/comments`, {
          text: updates.comment,
        });
      }
    } catch (error) {
      throw new Error(`Failed to update Shortcut story: ${error}`);
    }
  }

  async getTicket(ticketId: string): Promise<ExternalTicket> {
    try {
      const response = await this.apiClient.get(`/stories/${ticketId}`);
      const story: ShortcutStory = response.data;

      return this.mapShortcutStoryToTicket(story);
    } catch (error) {
      throw new Error(`Failed to get Shortcut story: ${error}`);
    }
  }

  async registerWebhook(url: string, events: string[]): Promise<void> {
    try {
      const webhookData: any = {
        name: "viberglass",
        url,
        event_types: events,
      };

      const projectId = this.parseNumericId(this.config.projectId);
      if (projectId) {
        webhookData.project_id = projectId;
      }

      await this.apiClient.post("/webhook", webhookData);
    } catch (error) {
      throw new Error(`Failed to register Shortcut webhook: ${error}`);
    }
  }

  handleWebhook(payload: any): WebhookEvent {
    const eventType = payload.event_type || payload.eventType || "";
    const story = payload.story;

    if (!story) {
      throw new Error("Invalid webhook payload: missing story data");
    }

    let webhookType:
      | "ticket_created"
      | "ticket_updated"
      | "ticket_deleted"
      | "comment_added";

    if (eventType.includes("create")) {
      webhookType = eventType.includes("comment")
        ? "comment_added"
        : "ticket_created";
    } else if (eventType.includes("delete")) {
      webhookType = "ticket_deleted";
    } else if (eventType.includes("comment")) {
      webhookType = "comment_added";
    } else {
      webhookType = "ticket_updated";
    }

    const ticket = this.mapShortcutStoryToTicket(story);

    return {
      type: webhookType,
      ticketId: story.id.toString(),
      ticket,
      changes: payload.changes || payload.actions?.[0]?.changes || {},
      timestamp:
        payload.timestamp || story.updated_at || new Date().toISOString(),
      source: "shortcut",
    };
  }

  private mapShortcutStoryToTicket(story: ShortcutStory): ExternalTicket {
    const labels = story.labels?.map((label) => label.name) || [];

    return {
      id: story.id.toString(),
      title: story.name,
      description: story.description || "",
      status:
        story.workflow_state_name ||
        story.workflow_state_type ||
        story.workflow_state_id?.toString() ||
        "unknown",
      priority: this.extractPriorityFromLabels(labels),
      assignee: story.owner_ids?.[0]?.toString(),
      labels,
      customFields: {
        shortcutId: story.id,
        workflowStateId: story.workflow_state_id,
        projectId: story.project_id,
      },
      createdAt: story.created_at,
      updatedAt: story.updated_at,
      url: story.app_url || "",
      projectKey: story.project_id?.toString(),
    };
  }

  private extractPriorityFromLabels(labels: string[]): string {
    const priorityLabel = labels.find((label) => label.startsWith("priority:"));
    if (priorityLabel) {
      const priority = priorityLabel.split(":")[1];
      return this.getPriorityFromSeverity(priority);
    }

    const severityLabel = labels.find((label) => label.startsWith("severity:"));
    if (severityLabel) {
      const severity = severityLabel.split(":")[1];
      return this.getPriorityFromSeverity(severity);
    }

    return "Medium";
  }

  protected formatBugReportDescription(ticket: Ticket): string {
    let description = super.formatBugReportDescription(ticket);

    description += `\n## Media Assets\n`;
    description += `**Screenshot:** [View Screenshot](${ticket.screenshot.url})\n`;
    if (ticket.recording) {
      description += `**Recording:** [View Recording](${ticket.recording.url})\n`;
    }

    if (ticket.annotations.length > 0) {
      description += `\n**Annotations:** ${ticket.annotations.length} annotation(s) available\n`;
    }

    return description;
  }
}
