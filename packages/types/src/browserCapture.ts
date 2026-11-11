import type { ErrorInfo, LogEntry, TicketMetadata } from './ticket'

/** `TicketMetadata.capturedBy` on a task the browser extension created. */
export const BROWSER_EXTENSION_CAPTURE = 'browser-extension'

/** A request the page made that failed: an error status, or no response at all. */
export interface FailedRequest {
  method: string
  url: string
  /** The response's status; absent when there was no response. */
  status?: number
  /** The browser's reason when there was no response, such as net::ERR_CONNECTION_REFUSED. */
  error?: string
  timestamp: string
}

/** What the browser extension captured from the page a task came from. */
export interface BrowserCapture {
  pageUrl?: string
  /** "Chrome 145 on macOS" */
  browser?: string
  /** "375 × 740", the window the page had */
  viewport?: string
  screen?: string
  pixelRatio?: number
  /** Console errors and warnings, and uncaught errors. */
  console: LogEntry[]
  uncaughtErrors: ErrorInfo[]
  failedRequests: FailedRequest[]
}

function named(info: { name: string; version: string } | undefined): string | undefined {
  if (!info?.name) return undefined
  return info.version ? `${info.name} ${info.version}` : info.name
}

function size(width: number | undefined, height: number | undefined): string | undefined {
  return width && height ? `${width} × ${height}` : undefined
}

/** The extension's capture on a task, or null when the extension didn't create it. */
export function browserCaptureOf(metadata: TicketMetadata | null | undefined): BrowserCapture | null {
  if (metadata?.capturedBy !== BROWSER_EXTENSION_CAPTURE) return null
  const browser = named(metadata.browser)
  const os = metadata.os?.name
  return {
    pageUrl: metadata.pageUrl,
    browser: browser && os ? `${browser} on ${os}` : browser,
    viewport: size(metadata.screen?.viewportWidth, metadata.screen?.viewportHeight),
    screen: size(metadata.screen?.width, metadata.screen?.height),
    pixelRatio: metadata.screen?.pixelRatio,
    console: (metadata.console ?? []).filter((entry) => entry.level === 'error' || entry.level === 'warn'),
    uncaughtErrors: metadata.errors ?? [],
    failedRequests: metadata.failedRequests ?? [],
  }
}

/** "POST https://… → 402", or the browser's reason when there was no response. */
export function describeFailedRequest(request: FailedRequest): string {
  const outcome = request.status ? `→ ${request.status}` : `failed${request.error ? `: ${request.error}` : ''}`
  return `${request.method} ${request.url} ${outcome}`
}

/** "Uncaught TypeError: x is undefined (app.js:12)" */
export function describeUncaughtError(error: ErrorInfo): string {
  if (!error.filename) return error.message
  return `${error.message} (${error.filename}${error.lineno ? `:${error.lineno}` : ''})`
}
