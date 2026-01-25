import axios, { AxiosInstance } from "axios";
import { BasePMIntegration } from "../../BasePMIntegration";
import { SlackConfig } from "../../../models/PMIntegration";
import {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from "@viberglass/types";

interface SlackMessage {
  text: string;
  ts: string;
  user?: string;
  bot_id?: string;
}

interface SlackChatPostResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: SlackMessage;
  error?: string;
}

interface SlackHistoryResponse {
  ok: boolean;
  messages: SlackMessage[];
  error?: string;
}

interface SlackPermalinkResponse {
  ok: boolean;
  permalink: string;
  error?: string;
}

interface SlackAuthTestResponse {
  ok: boolean;
  user_id?: string;
  team_id?: string;
  error?: string;
}

export class SlackIntegration extends BasePMIntegration {
  private config: SlackConfig;
  private apiClient: AxiosInstance;

  constructor(credentials: AuthCredentials & SlackConfig) {
    super(credentials);
    this.config = credentials;
    this.apiClient = axios.create({
      baseURL: this.config.baseUrl || "https://slack.com/api",
      headers: {
        Authorization: `Bearer ${this.getApiToken()}`,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "viberglass-receiver/1.0",
      },
    });
  }

  private getApiToken(): string {
    return this.config.token || this.config.apiKey || "";
  }

  private getChannelId(): string {
    const channel =
      this.config.channelId || this.config.channelName || this.config.channel;
    if (!channel) {
      throw new Error("Slack channel is not configured");
    }
    return channel;
  }

  private ensureSlackOk<T extends { ok: boolean; error?: string }>(
    data: T,
    action: string,
  ): T {
    if (!data.ok) {
      throw new Error(
        `Slack ${action} failed: ${data.error || "Unknown error"}`,
      );
    }

    return data;
  }

  async authenticate(credentials: AuthCredentials): Promise<void> {
    try {
      this.config = { ...this.config, ...credentials } as SlackConfig;

      const response = await this.apiClient.post<SlackAuthTestResponse>(
        "/auth.test",
        {},
      );
      this.ensureSlackOk(response.data, "auth.test");
    } catch (error) {
      throw new Error(`Slack authentication failed: ${error}`);
    }
  }

  async createTicket(ticket: Ticket): Promise<ExternalTicket> {
    try {
      const channel = this.getChannelId();
      const messageText = this.formatSlackMessage(ticket);
      const response = await this.apiClient.post<SlackChatPostResponse>(
        "/chat.postMessage",
        {
          channel,
          text: messageText,
          mrkdwn: true,
        },
      );

      const data = this.ensureSlackOk(response.data, "chat.postMessage");
      const permalink = await this.getPermalink(data.channel, data.ts);

      return this.mapSlackMessageToTicket({
        message: data.message,
        channel: data.channel,
        permalink,
        fallbackTitle: ticket.title,
        labels: this.buildLabels(ticket),
        status: "open",
      });
    } catch (error) {
      throw new Error(`Failed to create Slack message: ${error}`);
    }
  }

  async updateTicket(
    ticketId: string,
    updates: ExternalTicketUpdate,
  ): Promise<void> {
    try {
      const channel = this.getChannelId();
      const messageText = this.formatUpdateMessage(updates);
      if (!messageText.trim()) {
        return;
      }

      const response = await this.apiClient.post<SlackChatPostResponse>(
        "/chat.postMessage",
        {
          channel,
          thread_ts: ticketId,
          text: messageText,
          mrkdwn: true,
        },
      );

      this.ensureSlackOk(response.data, "chat.postMessage");
    } catch (error) {
      throw new Error(`Failed to update Slack message: ${error}`);
    }
  }

  async getTicket(ticketId: string): Promise<ExternalTicket> {
    try {
      const channel = this.getChannelId();
      const response = await this.apiClient.post<SlackHistoryResponse>(
        "/conversations.history",
        {
          channel,
          latest: ticketId,
          inclusive: true,
          limit: 1,
        },
      );

      const data = this.ensureSlackOk(response.data, "conversations.history");
      const message = data.messages[0];
      if (!message) {
        throw new Error("Slack message not found");
      }

      const permalink = await this.getPermalink(channel, message.ts);

      return this.mapSlackMessageToTicket({
        message,
        channel,
        permalink,
        status: "open",
      });
    } catch (error) {
      throw new Error(`Failed to get Slack message: ${error}`);
    }
  }

  async registerWebhook(_url: string, _events: string[]): Promise<void> {
    throw new Error(
      "Slack webhooks must be configured in the Slack app settings",
    );
  }

  handleWebhook(_payload: unknown): WebhookEvent {
    throw new Error("Slack webhook handling is not implemented");
  }

  private buildLabels(ticket: Ticket): string[] {
    const labels = [
      "bug",
      this.getLabelFromCategory(ticket.category),
      `severity:${ticket.severity}`,
    ];

    if (this.shouldEnableAutoFix(ticket)) {
      labels.push("auto-fix");
    }

    return labels;
  }

  private async getPermalink(channel: string, ts: string): Promise<string> {
    try {
      const response = await this.apiClient.post<SlackPermalinkResponse>(
        "/chat.getPermalink",
        {
          channel,
          message_ts: ts,
        },
      );
      const data = this.ensureSlackOk(response.data, "chat.getPermalink");
      return data.permalink;
    } catch {
      return "";
    }
  }

  private formatSlackMessage(ticket: Ticket): string {
    const lines: string[] = [];

    lines.push(`*Bug Report:* ${ticket.title}`);
    lines.push(`*Severity:* ${ticket.severity}`);
    lines.push(`*Category:* ${ticket.category}`);
    if (ticket.metadata.pageUrl) {
      lines.push(`*Page:* ${ticket.metadata.pageUrl}`);
    }
    if (ticket.autoFixRequested) {
      lines.push("*Auto-fix:* Requested");
    }

    lines.push("");
    lines.push(ticket.description);
    lines.push("");

    lines.push("*Technical Details*");
    if (ticket.metadata.browser) {
      lines.push(
        `- Browser: ${ticket.metadata.browser.name} ${ticket.metadata.browser.version}`,
      );
    }
    if (ticket.metadata.os) {
      lines.push(
        `- OS: ${ticket.metadata.os.name} ${ticket.metadata.os.version}`,
      );
    }
    if (ticket.metadata.screen) {
      lines.push(
        `- Screen: ${ticket.metadata.screen.width}x${ticket.metadata.screen.height}`,
      );
      lines.push(
        `- Viewport: ${ticket.metadata.screen.viewportWidth}x${ticket.metadata.screen.viewportHeight}`,
      );
    }
    if (ticket.metadata.network?.userAgent) {
      lines.push(`- User Agent: ${ticket.metadata.network.userAgent}`);
    }
    lines.push(`- Timestamp: ${ticket.timestamp}`);
    lines.push(`- Timezone: ${ticket.metadata.timezone}`);

    if (ticket.metadata.errors && ticket.metadata.errors.length > 0) {
      lines.push("");
      lines.push("*JavaScript Errors*");
      ticket.metadata.errors.slice(0, 3).forEach((error) => {
        lines.push(`- ${error.message}`);
        if (error.filename) {
          lines.push(`  ${error.filename}:${error.lineno}:${error.colno}`);
        }
      });
      if (ticket.metadata.errors.length > 3) {
        lines.push(`- ${ticket.metadata.errors.length - 3} more errors`);
      }
    }

    if (ticket.metadata.console && ticket.metadata.console.length > 0) {
      lines.push("");
      lines.push(
        `*Console Logs:* ${ticket.metadata.console.length} entries captured`,
      );
    }

    lines.push("");
    lines.push("*Media Assets*");
    lines.push(`- Screenshot: ${ticket.screenshot.url}`);
    if (ticket.recording) {
      lines.push(`- Recording: ${ticket.recording.url}`);
    }
    if (ticket.annotations.length > 0) {
      lines.push(`- Annotations: ${ticket.annotations.length}`);
    }

    return lines.join("\n");
  }

  private formatUpdateMessage(updates: ExternalTicketUpdate): string {
    const changes: string[] = [];

    if (updates.title) {
      changes.push(`- Title: ${updates.title}`);
    }
    if (updates.status) {
      changes.push(`- Status: ${updates.status}`);
    }
    if (updates.priority) {
      changes.push(`- Priority: ${updates.priority}`);
    }
    if (updates.assignee) {
      changes.push(`- Assignee: ${updates.assignee}`);
    }
    if (updates.labels && updates.labels.length > 0) {
      changes.push(`- Labels: ${updates.labels.join(", ")}`);
    }
    if (updates.description) {
      changes.push(`- Description: ${updates.description}`);
    }

    if (changes.length === 0 && updates.comment) {
      return updates.comment;
    }

    if (changes.length === 0) {
      return "";
    }

    const lines = ["*Ticket update*", ...changes];
    if (updates.comment) {
      lines.push("", `*Comment:* ${updates.comment}`);
    }

    return lines.join("\n");
  }

  private extractField(text: string, label: string): string | undefined {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\*${escaped}:\\*\\s*(.+)`, "i");
    const match = text.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private slackTimestampToIso(ts: string): string {
    const parsed = Number.parseFloat(ts);
    if (Number.isNaN(parsed)) {
      return new Date().toISOString();
    }

    return new Date(parsed * 1000).toISOString();
  }

  private mapSlackMessageToTicket(input: {
    message: SlackMessage;
    channel: string;
    permalink: string;
    fallbackTitle?: string;
    labels?: string[];
    status: string;
  }): ExternalTicket {
    const title =
      this.extractField(input.message.text, "Bug Report") ||
      input.fallbackTitle ||
      "Slack Ticket";
    const severity = this.extractField(input.message.text, "Severity");
    const category = this.extractField(input.message.text, "Category");
    const labels = [...(input.labels ?? [])];

    if (severity) {
      const severityLabel = `severity:${severity.toLowerCase()}`;
      if (!labels.includes(severityLabel)) {
        labels.push(severityLabel);
      }
    }
    if (category) {
      const categoryLabel = this.getLabelFromCategory(category);
      if (!labels.includes(categoryLabel)) {
        labels.push(categoryLabel);
      }
    }
    if (
      /\*Auto-fix:\*/i.test(input.message.text) &&
      !labels.includes("auto-fix")
    ) {
      labels.push("auto-fix");
    }

    const timestamp = this.slackTimestampToIso(input.message.ts);

    return {
      id: input.message.ts,
      title,
      description: input.message.text || "",
      status: input.status,
      priority: severity ? this.getPriorityFromSeverity(severity) : "Medium",
      assignee: input.message.user,
      labels,
      customFields: {
        slackChannelId: input.channel,
        slackMessageTs: input.message.ts,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      url: input.permalink,
      projectKey: input.channel,
    };
  }
}
