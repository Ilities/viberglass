import { BugReport } from '../../models/BugReport';
import { 
  PMIntegration, 
  AuthCredentials, 
  Ticket, 
  TicketUpdate, 
  CustomFieldMapping, 
  WebhookEvent,
  AutoFixDetectionConfig
} from '../../models/PMIntegration';

export abstract class BasePMIntegration implements PMIntegration {
  protected credentials: AuthCredentials;
  protected autoFixConfig: AutoFixDetectionConfig;

  constructor(credentials: AuthCredentials) {
    this.credentials = credentials;
    this.autoFixConfig = {
      labelMatching: ['auto-fix', 'ai-fix', '🤖 auto-fix', 'autofix'],
      customFields: { autoFixEnabled: true },
      titlePrefixes: ['[AUTO-FIX]', '[AI-FIX]', '[AUTOFIX]'],
      descriptionMarkers: ['<!-- AUTO-FIX -->', '<!-- AI-FIX -->'],
      projectSettings: {
        enableForAllBugs: false,
        enableForSeverity: ['high', 'critical']
      }
    };
  }

  abstract authenticate(credentials: AuthCredentials): Promise<void>;
  abstract createTicket(bugReport: BugReport): Promise<Ticket>;
  abstract updateTicket(ticketId: string, updates: TicketUpdate): Promise<void>;
  abstract getTicket(ticketId: string): Promise<Ticket>;
  abstract registerWebhook(url: string, events: string[]): Promise<void>;
  abstract handleWebhook(payload: unknown): WebhookEvent;

  hasAutoFixTag(ticket: Ticket): boolean {
    // Check labels
    const hasAutoFixLabel = ticket.labels.some(label => 
      this.autoFixConfig.labelMatching.some(pattern => 
        label.toLowerCase().includes(pattern.toLowerCase())
      )
    );

    if (hasAutoFixLabel) {
      return true;
    }

    // Check title prefixes
    const hasAutoFixTitle = this.autoFixConfig.titlePrefixes.some(prefix =>
      ticket.title.startsWith(prefix)
    );

    if (hasAutoFixTitle) {
      return true;
    }

    // Check description markers
    const hasAutoFixDescription = this.autoFixConfig.descriptionMarkers.some(marker =>
      ticket.description.includes(marker)
    );

    if (hasAutoFixDescription) {
      return true;
    }

    // Check custom fields
    for (const [field, expectedValue] of Object.entries(this.autoFixConfig.customFields)) {
      if (ticket.customFields[field] === expectedValue) {
        return true;
      }
    }

    return false;
  }

  mapCustomFields(bugReport: BugReport): CustomFieldMapping {
    return {
      severity: bugReport.severity,
      category: bugReport.category,
      browser: `${bugReport.metadata.browser.name} ${bugReport.metadata.browser.version}`,
      os: `${bugReport.metadata.os.name} ${bugReport.metadata.os.version}`,
      pageUrl: bugReport.metadata.pageUrl,
      userAgent: bugReport.metadata.network.userAgent,
      screenResolution: `${bugReport.metadata.screen.width}x${bugReport.metadata.screen.height}`,
      viewportSize: `${bugReport.metadata.screen.viewportWidth}x${bugReport.metadata.screen.viewportHeight}`,
      timestamp: bugReport.timestamp.toISOString(),
      errorCount: bugReport.metadata.errors.length,
      consoleLogCount: bugReport.metadata.console.length
    };
  }

  protected formatBugReportDescription(bugReport: BugReport): string {
    let description = `${bugReport.description}\n\n`;
    
    description += `## Technical Details\n`;
    description += `**Browser:** ${bugReport.metadata.browser.name} ${bugReport.metadata.browser.version}\n`;
    description += `**OS:** ${bugReport.metadata.os.name} ${bugReport.metadata.os.version}\n`;
    description += `**Screen Resolution:** ${bugReport.metadata.screen.width}x${bugReport.metadata.screen.height}\n`;
    description += `**Viewport:** ${bugReport.metadata.screen.viewportWidth}x${bugReport.metadata.screen.viewportHeight}\n`;
    description += `**Page URL:** ${bugReport.metadata.pageUrl}\n`;
    description += `**Timestamp:** ${bugReport.timestamp.toISOString()}\n\n`;

    if (bugReport.metadata.errors.length > 0) {
      description += `## JavaScript Errors\n`;
      bugReport.metadata.errors.forEach((error, index) => {
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

    if (bugReport.metadata.console.length > 0) {
      description += `## Console Logs\n`;
      const errorLogs = bugReport.metadata.console.filter(log => log.level === 'error');
      const warningLogs = bugReport.metadata.console.filter(log => log.level === 'warn');
      
      if (errorLogs.length > 0) {
        description += `### Errors\n`;
        errorLogs.slice(0, 10).forEach(log => {
          description += `- ${log.message}\n`;
        });
        description += `\n`;
      }
      
      if (warningLogs.length > 0) {
        description += `### Warnings\n`;
        warningLogs.slice(0, 10).forEach(log => {
          description += `- ${log.message}\n`;
        });
        description += `\n`;
      }
    }

    if (bugReport.autoFixRequested) {
      description += `## Auto-Fix Request\n`;
      description += `This bug report has been marked for automatic fixing. An AI agent will analyze this issue and attempt to create a pull request with a solution.\n\n`;
      description += `<!-- AUTO-FIX -->\n`;
    }

    return description;
  }

  protected getPriorityFromSeverity(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'Critical';
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return 'Medium';
    }
  }

  protected getLabelFromCategory(category: string): string {
    return `bug:${category.toLowerCase().replace(/\s+/g, '-')}`;
  }

  protected shouldEnableAutoFix(bugReport: BugReport): boolean {
    if (bugReport.autoFixRequested) {
      return true;
    }

    if (this.autoFixConfig.projectSettings.enableForAllBugs) {
      return true;
    }

    return this.autoFixConfig.projectSettings.enableForSeverity.includes(bugReport.severity);
  }

  updateAutoFixConfig(config: Partial<AutoFixDetectionConfig>): void {
    this.autoFixConfig = {
      ...this.autoFixConfig,
      ...config
    };
  }
}