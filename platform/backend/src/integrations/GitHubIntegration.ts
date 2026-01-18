import axios from 'axios';
import { BasePMIntegration } from './BasePMIntegration';
import { BugReport } from '../models/BugReport';
import { 
  AuthCredentials, 
  Ticket, 
  TicketUpdate, 
  WebhookEvent,
  GitHubConfig 
} from '../models/PMIntegration';

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  labels: Array<{ name: string; color: string }>;
  assignee?: { login: string };
  created_at: string;
  updated_at: string;
  html_url: string;
}

export class GitHubIntegration extends BasePMIntegration {
  private config: GitHubConfig;
  private apiClient: any;

  constructor(credentials: AuthCredentials & GitHubConfig) {
    super(credentials);
    this.config = credentials;
    this.setupApiClient();
  }

  private setupApiClient() {
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${this.config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vibug-receiver/1.0'
      }
    });
  }

  async authenticate(credentials: AuthCredentials): Promise<void> {
    try {
      this.config = { ...this.config, ...credentials } as GitHubConfig;
      this.setupApiClient();
      
      // Test authentication by getting user info
      await this.apiClient.get('/user');
    } catch (error) {
      throw new Error(`GitHub authentication failed: ${error}`);
    }
  }

  async createTicket(bugReport: BugReport): Promise<Ticket> {
    try {
      const labels = [
        'bug',
        this.getLabelFromCategory(bugReport.category),
        `severity:${bugReport.severity}`
      ];

      if (this.config.labels) {
        labels.push(...this.config.labels);
      }

      if (this.shouldEnableAutoFix(bugReport)) {
        labels.push('auto-fix');
      }

      const issueData = {
        title: bugReport.title,
        body: this.formatBugReportDescription(bugReport),
        labels: labels
      };

      const response = await this.apiClient.post(
        `/repos/${this.config.owner}/${this.config.repo}/issues`,
        issueData
      );

      const issue: GitHubIssue = response.data;

      return this.mapGitHubIssueToTicket(issue);
    } catch (error) {
      throw new Error(`Failed to create GitHub issue: ${error}`);
    }
  }

  async updateTicket(ticketId: string, updates: TicketUpdate): Promise<void> {
    try {
      const updateData: any = {};

      if (updates.title) {
        updateData.title = updates.title;
      }

      if (updates.description) {
        updateData.body = updates.description;
      }

      if (updates.status) {
        updateData.state = updates.status === 'closed' ? 'closed' : 'open';
      }

      if (updates.labels) {
        updateData.labels = updates.labels;
      }

      if (updates.assignee) {
        updateData.assignee = updates.assignee;
      }

      await this.apiClient.patch(
        `/repos/${this.config.owner}/${this.config.repo}/issues/${ticketId}`,
        updateData
      );

      // Add comment if provided
      if (updates.comment) {
        await this.apiClient.post(
          `/repos/${this.config.owner}/${this.config.repo}/issues/${ticketId}/comments`,
          { body: updates.comment }
        );
      }
    } catch (error) {
      throw new Error(`Failed to update GitHub issue: ${error}`);
    }
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    try {
      const response = await this.apiClient.get(
        `/repos/${this.config.owner}/${this.config.repo}/issues/${ticketId}`
      );

      const issue: GitHubIssue = response.data;
      return this.mapGitHubIssueToTicket(issue);
    } catch (error) {
      throw new Error(`Failed to get GitHub issue: ${error}`);
    }
  }

  async registerWebhook(url: string, events: string[]): Promise<void> {
    try {
      const webhookData = {
        name: 'web',
        active: true,
        events: events,
        config: {
          url: url,
          content_type: 'json',
          insecure_ssl: '0'
        }
      };

      await this.apiClient.post(
        `/repos/${this.config.owner}/${this.config.repo}/hooks`,
        webhookData
      );
    } catch (error) {
      throw new Error(`Failed to register GitHub webhook: ${error}`);
    }
  }

  handleWebhook(payload: any): WebhookEvent {
    const action = payload.action;
    const issue = payload.issue;

    if (!issue) {
      throw new Error('Invalid webhook payload: missing issue data');
    }

    let eventType: 'ticket_created' | 'ticket_updated' | 'ticket_deleted' | 'comment_added';

    switch (action) {
      case 'opened':
        eventType = 'ticket_created';
        break;
      case 'edited':
      case 'labeled':
      case 'unlabeled':
      case 'assigned':
      case 'unassigned':
        eventType = 'ticket_updated';
        break;
      case 'closed':
      case 'reopened':
        eventType = 'ticket_updated';
        break;
      case 'deleted':
        eventType = 'ticket_deleted';
        break;
      default:
        if (payload.comment) {
          eventType = 'comment_added';
        } else {
          eventType = 'ticket_updated';
        }
    }

    const ticket = this.mapGitHubIssueToTicket(issue);

    return {
      type: eventType,
      ticketId: issue.number.toString(),
      ticket,
      changes: payload.changes || {},
      timestamp: payload.issue?.updated_at || new Date().toISOString(),
      source: 'github'
    };
  }

  private mapGitHubIssueToTicket(issue: GitHubIssue): Ticket {
    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      status: issue.state,
      priority: this.extractPriorityFromLabels(issue.labels.map(l => l.name)),
      assignee: issue.assignee?.login,
      labels: issue.labels.map(l => l.name),
      customFields: {
        githubId: issue.id,
        githubNumber: issue.number
      },
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.html_url,
      repositoryUrl: `https://github.com/${this.config.owner}/${this.config.repo}`
    };
  }

  private extractPriorityFromLabels(labels: string[]): string {
    const priorityLabel = labels.find(label => label.startsWith('priority:') || label.startsWith('severity:'));
    if (priorityLabel) {
      const priority = priorityLabel.split(':')[1];
      return this.getPriorityFromSeverity(priority);
    }
    return 'Medium';
  }

  protected formatBugReportDescription(bugReport: BugReport): string {
    let description = super.formatBugReportDescription(bugReport);
    
    // Add GitHub-specific formatting
    description += `\n## Media Assets\n`;
    description += `**Screenshot:** [View Screenshot](${bugReport.screenshot.url})\n`;
    if (bugReport.recording) {
      description += `**Recording:** [View Recording](${bugReport.recording.url})\n`;
    }

    if (bugReport.annotations.length > 0) {
      description += `\n**Annotations:** ${bugReport.annotations.length} annotation(s) available\n`;
    }

    return description;
  }

  // GitHub-specific methods
  async createPullRequest(title: string, body: string, head: string, base: string = 'main'): Promise<any> {
    try {
      const response = await this.apiClient.post(
        `/repos/${this.config.owner}/${this.config.repo}/pulls`,
        {
          title,
          body,
          head,
          base
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create pull request: ${error}`);
    }
  }

  async linkPullRequestToIssue(issueNumber: string, pullRequestNumber: string): Promise<void> {
    try {
      const comment = `This issue is being addressed by #${pullRequestNumber}`;
      await this.apiClient.post(
        `/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/comments`,
        { body: comment }
      );
    } catch (error) {
      throw new Error(`Failed to link PR to issue: ${error}`);
    }
  }

  async getRepositoryInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get(`/repos/${this.config.owner}/${this.config.repo}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get repository info: ${error}`);
    }
  }
}