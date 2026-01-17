// API client for ViBug platform
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface BugReport {
  id: string;
  projectId: string;
  timestamp: Date;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  metadata: {
    browser: { name: string; version: string };
    os: { name: string; version: string };
    screen: { width: number; height: number; viewportWidth: number; viewportHeight: number; pixelRatio: number };
    network: { userAgent: string; language: string; cookiesEnabled: boolean; onLine: boolean };
    console: Array<{ level: string; message: string; timestamp: Date; source?: string }>;
    errors: Array<{ message: string; stack?: string; filename?: string; lineno?: number; colno?: number; timestamp: Date }>;
    pageUrl: string;
    referrer?: string;
    localStorage?: Record<string, any>;
    sessionStorage?: Record<string, any>;
    timestamp: Date;
    timezone: string;
  };
  screenshot: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: Date;
  };
  recording?: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    uploadedAt: Date;
  };
  annotations: Array<{
    id: string;
    type: 'arrow' | 'rectangle' | 'text' | 'blur';
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    color?: string;
  }>;
  ticketId?: string;
  ticketUrl?: string;
  ticketSystem: 'jira' | 'linear' | 'github' | 'gitlab' | 'azure' | 'asana' | 'trello' | 'monday' | 'clickup';
  autoFixRequested: boolean;
  autoFixStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
  pullRequestUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BugReportSummary {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  timestamp: Date;
  ticketId?: string;
  ticketSystem: string;
  autoFixStatus?: string;
  status: 'open' | 'resolved' | 'in_progress';
}

export interface BugReportsResponse {
  success: boolean;
  data: BugReport[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface WebhookStatus {
  webhooks: Array<{
    event_type: string;
    count: number;
    processed_count: number;
    pending_count: number;
  }>;
  autoFixQueue: Array<{
    status: string;
    count: number;
  }>;
}

// Bug Reports API
export async function getBugReports(projectId: string, limit: number = 50, offset: number = 0): Promise<BugReport[]> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports?projectId=${projectId}&limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug reports');
  }
  const data: BugReportsResponse = await response.json();
  return data.data;
}

export async function getBugReport(id: string): Promise<BugReport> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch bug report');
  }
  const data = await response.json();
  return data.data;
}

export async function updateBugReport(id: string, updates: Partial<BugReport>): Promise<BugReport> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error('Failed to update bug report');
  }
  const data = await response.json();
  return data.data;
}

export async function getMediaSignedUrl(bugReportId: string, mediaId: string): Promise<{ signedUrl: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${bugReportId}/media/${mediaId}/signed-url`);
  if (!response.ok) {
    throw new Error('Failed to get signed URL');
  }
  const data = await response.json();
  return data.data;
}

// Webhook Status API
export async function getWebhookStatus(): Promise<WebhookStatus> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch webhook status');
  }
  return response.json();
}

// Auto-fix API
export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/trigger-autofix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketId,
      ticketSystem,
      repositoryUrl,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to trigger auto-fix');
  }
}

// Mock data for development (when backend is not available)
export function getMockBugReports(): BugReportSummary[] {
  return [
    {
      id: 'bug-001',
      title: 'Button not clickable on mobile',
      severity: 'high',
      category: 'UI/UX',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      ticketId: 'ISSUE-123',
      ticketSystem: 'github',
      autoFixStatus: 'pending',
      status: 'open',
    },
    {
      id: 'bug-002',
      title: 'Form validation error',
      severity: 'medium',
      category: 'Forms',
      timestamp: new Date('2024-01-14T14:20:00Z'),
      ticketId: 'ISSUE-124',
      ticketSystem: 'linear',
      autoFixStatus: 'completed',
      status: 'resolved',
    },
    {
      id: 'bug-003',
      title: 'Page load performance issue',
      severity: 'low',
      category: 'Performance',
      timestamp: new Date('2024-01-13T09:15:00Z'),
      ticketSystem: 'jira',
      status: 'in_progress',
    },
  ];
}

export function getMockBugReportStats() {
  return {
    total: 47,
    open: 23,
    resolved: 18,
    inProgress: 6,
    bySeverity: {
      critical: 2,
      high: 8,
      medium: 15,
      low: 22,
    },
    byCategory: {
      'UI/UX': 12,
      'Forms': 8,
      'Performance': 6,
      'API': 5,
      'Security': 3,
      'Other': 13,
    },
    autoFixStats: {
      requested: 15,
      completed: 8,
      pending: 4,
      failed: 3,
    },
  };
}