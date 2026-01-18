// Re-export all types from shared types package
export type {
  Severity,
  TicketSystem,
  AutoFixStatus,
  BrowserInfo,
  OSInfo,
  ScreenInfo,
  NetworkInfo,
  LogEntry,
  ErrorInfo,
  MediaAsset,
  Annotation,
  BugReportMetadata,
  BugReport,
  UpdateBugReportRequest,
} from '@viberator/types';

// Backend-specific types for bug report creation
import type { BugReportMetadata, Severity, TicketSystem, Annotation } from '@viberator/types';

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
