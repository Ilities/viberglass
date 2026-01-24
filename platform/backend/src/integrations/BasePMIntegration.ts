import {
  PMIntegration,
  CustomFieldMapping,
  AutoFixDetectionConfig,
} from "../models/PMIntegration";
import {
  AuthCredentials,
  ExternalTicket,
  ExternalTicketUpdate,
  Ticket,
  WebhookEvent,
} from "@viberglass/types";

export abstract class BasePMIntegration implements PMIntegration {
  protected credentials: AuthCredentials;
  protected autoFixConfig: AutoFixDetectionConfig;

  constructor(credentials: AuthCredentials) {
    this.credentials = credentials;
    this.autoFixConfig = {
      labelMatching: ["auto-fix", "ai-fix", "🤖 auto-fix", "autofix"],
      customFields: { autoFixEnabled: true },
      titlePrefixes: ["[AUTO-FIX]", "[AI-FIX]", "[AUTOFIX]"],
      descriptionMarkers: ["<!-- AUTO-FIX -->", "<!-- AI-FIX -->"],
      projectSettings: {
        enableForAllBugs: false,
        enableForSeverity: ["high", "critical"],
      },
    };
  }

  abstract authenticate(credentials: AuthCredentials): Promise<void>;
  abstract createTicket(ticket: Ticket): Promise<ExternalTicket>;
  abstract updateTicket(
    ticketId: string,
    updates: ExternalTicketUpdate,
  ): Promise<void>;
  abstract getTicket(ticketId: string): Promise<ExternalTicket>;
  abstract registerWebhook(url: string, events: string[]): Promise<void>;
  abstract handleWebhook(payload: unknown): WebhookEvent;

  hasAutoFixTag(ticket: ExternalTicket): boolean {
    // Check labels
    const hasAutoFixLabel = ticket.labels.some((label) =>
      this.autoFixConfig.labelMatching.some((pattern) =>
        label.toLowerCase().includes(pattern.toLowerCase()),
      ),
    );

    if (hasAutoFixLabel) {
      return true;
    }

    // Check title prefixes
    const hasAutoFixTitle = this.autoFixConfig.titlePrefixes.some((prefix) =>
      ticket.title.startsWith(prefix),
    );

    if (hasAutoFixTitle) {
      return true;
    }

    // Check description markers
    const hasAutoFixDescription = this.autoFixConfig.descriptionMarkers.some(
      (marker) => ticket.description.includes(marker),
    );

    if (hasAutoFixDescription) {
      return true;
    }

    // Check custom fields
    for (const [field, expectedValue] of Object.entries(
      this.autoFixConfig.customFields,
    )) {
      if (ticket.customFields[field] === expectedValue) {
        return true;
      }
    }

    return false;
  }

  mapCustomFields(ticket: Ticket): CustomFieldMapping {
    return {
      severity: ticket.severity,
      category: ticket.category,
      browser: ticket.metadata.browser
        ? `${ticket.metadata.browser.name} ${ticket.metadata.browser.version}`
        : "Unknown",
      os: ticket.metadata.os
        ? `${ticket.metadata.os.name} ${ticket.metadata.os.version}`
        : "Unknown",
      pageUrl: ticket.metadata.pageUrl,
      userAgent: ticket.metadata.network?.userAgent,
      screenResolution: ticket.metadata.screen
        ? `${ticket.metadata.screen.width}x${ticket.metadata.screen.height}`
        : "Unknown",
      viewportSize: ticket.metadata.screen
        ? `${ticket.metadata.screen.viewportWidth}x${ticket.metadata.screen.viewportHeight}`
        : "Unknown",
      timestamp: ticket.timestamp,
      errorCount: ticket.metadata.errors?.length ?? 0,
      consoleLogCount: ticket.metadata.console?.length ?? 0,
    };
  }

  protected formatBugReportDescription(ticket: Ticket): string {
    let description = `${ticket.description}\n\n`;

    description += `## Technical Details\n`;
    if (ticket.metadata.browser) {
      description += `**Browser:** ${ticket.metadata.browser.name} ${ticket.metadata.browser.version}\n`;
    }
    if (ticket.metadata.os) {
      description += `**OS:** ${ticket.metadata.os.name} ${ticket.metadata.os.version}\n`;
    }
    if (ticket.metadata.screen) {
      description += `**Screen Resolution:** ${ticket.metadata.screen.width}x${ticket.metadata.screen.height}\n`;
      description += `**Viewport:** ${ticket.metadata.screen.viewportWidth}x${ticket.metadata.screen.viewportHeight}\n`;
    }
    description += `**Page URL:** ${ticket.metadata.pageUrl || "N/A"}\n`;
    description += `**Timestamp:** ${ticket.timestamp}\n\n`;

    if (ticket.metadata.errors && ticket.metadata.errors.length > 0) {
      description += `## JavaScript Errors\n`;
      ticket.metadata.errors.forEach((error, index) => {
        description += `### Error ${index + 1}\n`;
        description += `**Message:** ${error.message}\n`;
        if (error.filename) {
          description += `**File:** ${error.filename}:${error.lineno}:${error.colno}\n`;
        }
        if (error.stack) {
          description += `**Stack Trace:**\n\`\`\`\n${error.stack}\n\`\`\`\n`;
        }
        description += `\n`;
      });
    }

    if (ticket.metadata.console && ticket.metadata.console.length > 0) {
      description += `## Console Logs\n`;
      const errorLogs = ticket.metadata.console.filter(
        (log) => log.level === "error",
      );
      const warningLogs = ticket.metadata.console.filter(
        (log) => log.level === "warn",
      );

      if (errorLogs.length > 0) {
        description += `### Errors\n`;
        errorLogs.slice(0, 10).forEach((log) => {
          description += `- ${log.message}\n`;
        });
        description += `\n`;
      }

      if (warningLogs.length > 0) {
        description += `### Warnings\n`;
        warningLogs.slice(0, 10).forEach((log) => {
          description += `- ${log.message}\n`;
        });
        description += `\n`;
      }
    }

    if (ticket.autoFixRequested) {
      description += `## Auto-Fix Request\n`;
      description += `This bug report has been marked for automatic fixing. An AI agent will analyze this issue and attempt to create a pull request with a solution.\n\n`;
      description += `<!-- AUTO-FIX -->\n`;
    }

    return description;
  }

  protected getPriorityFromSeverity(severity: string): string {
    switch (severity.toLowerCase()) {
      case "critical":
        return "Critical";
      case "high":
        return "High";
      case "medium":
        return "Medium";
      case "low":
        return "Low";
      default:
        return "Medium";
    }
  }

  protected getLabelFromCategory(category: string): string {
    return `bug:${category.toLowerCase().replace(/\s+/g, "-")}`;
  }

  protected shouldEnableAutoFix(ticket: Ticket): boolean {
    if (ticket.autoFixRequested) {
      return true;
    }

    if (this.autoFixConfig.projectSettings.enableForAllBugs) {
      return true;
    }

    return this.autoFixConfig.projectSettings.enableForSeverity.includes(
      ticket.severity,
    );
  }

  updateAutoFixConfig(config: Partial<AutoFixDetectionConfig>): void {
    this.autoFixConfig = {
      ...this.autoFixConfig,
      ...config,
    };
  }
}
