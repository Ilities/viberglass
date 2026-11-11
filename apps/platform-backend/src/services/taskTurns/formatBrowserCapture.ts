import { browserCaptureOf, describeFailedRequest, describeUncaughtError, type TicketMetadata } from "@viberglass/types";

/** The most entries of each kind the agent is shown; a page in a loop can log thousands. */
const LIMIT = 20;

function escape(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function list(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  const shown = lines.slice(0, LIMIT).map((line) => `  - ${escape(line.replace(/\s+/g, " ").trim())}`);
  const more = lines.length > LIMIT ? [`  - and ${lines.length - LIMIT} more`] : [];
  return [`${title}:`, ...shown, ...more];
}

/** What the browser extension captured from the task's page, as lines for the agent; null for a task it didn't create. */
export function formatBrowserCapture(metadata: TicketMetadata | null | undefined): string | null {
  const capture = browserCaptureOf(metadata);
  if (!capture) return null;
  const facts = [
    capture.pageUrl ? `Page: ${escape(capture.pageUrl)}` : null,
    capture.browser ? `Browser: ${escape(capture.browser)}` : null,
    capture.viewport ? `Viewport: ${capture.viewport}${capture.pixelRatio ? ` at pixel ratio ${capture.pixelRatio}` : ""}` : null,
    capture.screen ? `Screen: ${capture.screen}` : null,
  ].filter((line): line is string => line !== null);
  return [
    ...facts,
    ...list("Console errors and warnings", capture.console.map((entry) => `${entry.level}: ${entry.message}`)),
    ...list("Uncaught errors", capture.uncaughtErrors.map(describeUncaughtError)),
    ...list("Failed requests", capture.failedRequests.map(describeFailedRequest)),
  ].join("\n");
}
