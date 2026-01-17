export interface BrowserInfo {
  name: string;
  version: string;
}

export interface OSInfo {
  name: string;
  version: string;
}

export interface ScreenInfo {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
}

export interface NetworkInfo {
  userAgent: string;
  language: string;
  cookiesEnabled: boolean;
  onLine: boolean;
}

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: Date;
  source?: string;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  timestamp: Date;
}

export interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: Date;
}

export interface Annotation {
  id: string;
  type: 'arrow' | 'rectangle' | 'text' | 'blur';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
}

export interface BugReportMetadata {
  browser: BrowserInfo;
  os: OSInfo;
  screen: ScreenInfo;
  network: NetworkInfo;
  console: LogEntry[];
  errors: ErrorInfo[];
  pageUrl: string;
  referrer?: string;
  localStorage?: Record<string, any>;
  sessionStorage?: Record<string, any>;
  timestamp: Date;
  timezone: string;
}

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type TicketSystem = 'jira' | 'linear' | 'github' | 'gitlab' | 'azure' | 'asana' | 'trello' | 'monday' | 'clickup';
export type AutoFixStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface BugReport {
  id: string;
  projectId: string;
  timestamp: Date;
  
  // User-provided
  title: string;
  description: string;
  severity: Severity;
  category: string;
  
  // Technical metadata
  metadata: BugReportMetadata;
  
  // Media
  screenshot: MediaAsset;
  recording?: MediaAsset;
  annotations: Annotation[];
  
  // Integration
  ticketId?: string;
  ticketUrl?: string;
  ticketSystem: TicketSystem;
  
  // Auto-fix
  autoFixRequested: boolean;
  autoFixStatus?: AutoFixStatus;
  pullRequestUrl?: string;
  
  // System fields
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBugReportRequest {
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  metadata: BugReportMetadata;
  annotations: Annotation[];
  autoFixRequested: boolean;
  ticketSystem: TicketSystem;
}

export interface UpdateBugReportRequest {
  title?: string;
  description?: string;
  severity?: Severity;
  category?: string;
  ticketId?: string;
  ticketUrl?: string;
  autoFixStatus?: AutoFixStatus;
  pullRequestUrl?: string;
}