import type { ConsoleEntry, NetworkError, PageMetadata } from "@/types";

interface ContextData {
  console: ConsoleEntry[];
  errors: NetworkError[];
  metadata: PageMetadata;
}

function collectContext(): ContextData {
  const consoleEntries: ConsoleEntry[] = [];
  const networkErrors: NetworkError[] = [];

  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    consoleEntries.push({
      level: "error",
      message: args.map(String).join(" "),
      timestamp: new Date().toISOString(),
    });
    origError.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    consoleEntries.push({
      level: "warn",
      message: args.map(String).join(" "),
      timestamp: new Date().toISOString(),
    });
    origWarn.apply(console, args);
  };

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          entry.entryType === "resource" &&
          "responseStatus" in entry &&
          (entry as PerformanceResourceTiming).responseStatus >= 400
        ) {
          const resource = entry as PerformanceResourceTiming;
          networkErrors.push({
            url: resource.name,
            status: resource.responseStatus,
            method: "GET",
            timestamp: new Date().toISOString(),
          });
        }
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {}

  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge)\/([\d.]+)/);
  const osMatch = ua.match(/\(([^)]+)\)/);

  const metadata: PageMetadata = {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    browserName: browserMatch?.[1] || "Unknown",
    browserVersion: browserMatch?.[2] || "Unknown",
    osName: osMatch?.[1]?.split(";")[0]?.trim() || "Unknown",
    osVersion: osMatch?.[1]?.split(";")[1]?.trim() || "Unknown",
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    userAgent: ua,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
  };

  const existingErrors = (
    window as unknown as { __viberglassErrors?: ErrorInfo[] }
  ).__viberglassErrors;

  return {
    console: consoleEntries,
    errors: networkErrors,
    metadata,
  };
}

interface ErrorInfo {
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  timestamp: string;
}

const capturedErrors: ErrorInfo[] = [];

const origErrorHandler = window.onerror;
window.onerror = (message, source, lineno, colno, error) => {
  capturedErrors.push({
    message: String(message),
    stack: error?.stack,
    filename: source || undefined,
    lineno: lineno || undefined,
    colno: colno || undefined,
    timestamp: new Date().toISOString(),
  });
  if (origErrorHandler) origErrorHandler(message, source, lineno, colno, error);
};

const origUnhandledRejection = window.onunhandledrejection;
window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  capturedErrors.push({
    message: String(event.reason?.message || event.reason),
    stack: event.reason?.stack,
    timestamp: new Date().toISOString(),
  });
  if (origUnhandledRejection)
    origUnhandledRejection.call(window, event);
};

(window as unknown as { __viberglassErrors: ErrorInfo[] }).__viberglassErrors =
  capturedErrors;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "COLLECT_CONTEXT") {
    const context = collectContext();
    context.errors.push(
      ...capturedErrors.map((e) => ({
        url: e.filename || "",
        status: 0,
        method: "JS_ERROR",
        timestamp: e.timestamp,
      })),
    );
    sendResponse({ data: context });
  }
});
