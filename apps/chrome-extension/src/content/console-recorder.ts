import type { ConsoleEntry, UncaughtError } from "@/types";

// Runs in the page's own world from the start of every page load, since only
// there it sees the page's console and errors. It keeps them in the page until
// a capture reads them; nothing leaves the page otherwise.

const LIMIT = 50;

declare global {
  interface Window {
    __viberglassConsole?: { console: ConsoleEntry[]; uncaughtErrors: UncaughtError[] };
  }
}

function text(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function keep<T>(list: T[], entry: T): void {
  list.push(entry);
  if (list.length > LIMIT) list.shift();
}

if (!window.__viberglassConsole) {
  const recorded: { console: ConsoleEntry[]; uncaughtErrors: UncaughtError[] } = { console: [], uncaughtErrors: [] };
  window.__viberglassConsole = recorded;

  const levels: Array<"error" | "warn"> = ["error", "warn"];
  for (const level of levels) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      keep(recorded.console, { level, message: args.map(text).join(" "), timestamp: new Date().toISOString() });
      original.apply(console, args);
    };
  }

  window.addEventListener("error", (event) => {
    keep(recorded.uncaughtErrors, {
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
      colno: event.colno || undefined,
      timestamp: new Date().toISOString(),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    keep(recorded.uncaughtErrors, {
      message: `Unhandled rejection: ${text(event.reason)}`,
      timestamp: new Date().toISOString(),
    });
  });
}
