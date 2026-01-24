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
  TicketMetadata,
  Ticket,
  UpdateTicketRequest,
} from "@viberglass/types";

// Backend-specific types for ticket creation
import type {
  TicketMetadata,
  Severity,
  TicketSystem,
  Annotation,
} from "@viberglass/types";

export interface CreateTicketRequest {
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  metadata: TicketMetadata;
  annotations: Annotation[];
  autoFixRequested: boolean;
  ticketSystem: TicketSystem;
}
