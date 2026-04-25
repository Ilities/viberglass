export type TicketWorkflowPhase = "research" | "planning" | "execution";
export type Severity = "low" | "medium" | "high" | "critical";

export interface AuthState {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
  };
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface Clanker {
  id: string;
  name: string;
  projectId: string;
  agentName: string;
}

export interface CaptureState {
  screenshotDataUrl: string | null;
  recordingBlob: Blob | null;
  consoleEntries: ConsoleEntry[];
  networkErrors: NetworkError[];
  pageMetadata: PageMetadata;
  annotations: Annotation[];
}

export interface ConsoleEntry {
  level: "error" | "warn" | "info" | "debug";
  message: string;
  timestamp: string;
  source?: string;
}

export interface NetworkError {
  url: string;
  status: number;
  method: string;
  timestamp: string;
}

export interface PageMetadata {
  url: string;
  title: string;
  referrer: string;
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  userAgent: string;
  language: string;
  cookiesEnabled: boolean;
  onLine: boolean;
}

export interface Annotation {
  id: string;
  type: "arrow" | "rectangle" | "text" | "blur";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
}

export interface TicketMetadata {
  browser?: { name: string; version: string };
  os?: { name: string; version: string };
  screen?: {
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
    pixelRatio: number;
  };
  network?: {
    userAgent: string;
    language: string;
    cookiesEnabled: boolean;
    onLine: boolean;
  };
  console?: ConsoleEntry[];
  errors?: Array<{
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    timestamp: string;
  }>;
  pageUrl?: string;
  referrer?: string;
  localStorage?: Record<string, unknown>;
  sessionStorage?: Record<string, unknown>;
  timestamp: string;
  timezone: string;
}

export interface TicketResponse {
  success: boolean;
  data: {
    id: string;
    projectId: string;
    title: string;
    workflowPhase: TicketWorkflowPhase;
    status: string;
    [key: string]: unknown;
  };
}

export interface CreateTicketPayload {
  projectId: string;
  title: string;
  description: string;
  severity: Severity;
  category: string;
  metadata: TicketMetadata;
  annotations: Annotation[];
  autoFixRequested: boolean;
  ticketSystem?: string;
  workflowPhase?: TicketWorkflowPhase;
}

export type CaptureMode = "area" | "element" | "tab" | null;
export type RecordingState = "idle" | "recording" | "stopped";
