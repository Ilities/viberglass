import type { CaptureState, ConsoleEntry, FailedRequest, PageMetadata, UncaughtError } from "@/types";

export type PageContext = Partial<Pick<CaptureState, "consoleEntries" | "uncaughtErrors" | "failedRequests" | "pageMetadata">>;

interface CollectedContext {
  metadata?: PageMetadata;
}

interface PageConsole {
  console: ConsoleEntry[];
  uncaughtErrors: UncaughtError[];
}

async function pageDetails(tabId: number): Promise<CollectedContext> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content/context-collector.js"] });
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "COLLECT_CONTEXT" }, (response?: { data?: CollectedContext }) =>
      resolve(response?.data ?? {}),
    );
  });
}

/** What the console recorder kept in the page since it loaded. */
async function pageConsole(tabId: number): Promise<PageConsole> {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => window.__viberglassConsole ?? { console: [], uncaughtErrors: [] },
  });
  return frame?.result ?? { console: [], uncaughtErrors: [] };
}

async function failedRequests(tabId: number): Promise<FailedRequest[]> {
  const response: { data?: FailedRequest[] } | undefined = await chrome.runtime.sendMessage({ type: "GET_FAILED_REQUESTS", tabId });
  return response?.data ?? [];
}

/** What the tab's page shows about itself: its details, console and errors, and the requests that failed since it loaded. */
export async function collectPageContext(tabId: number): Promise<PageContext> {
  const [details, logged, requests] = await Promise.all([
    pageDetails(tabId).catch((): CollectedContext => ({})),
    pageConsole(tabId).catch((): PageConsole => ({ console: [], uncaughtErrors: [] })),
    failedRequests(tabId).catch((): FailedRequest[] => []),
  ]);
  return {
    consoleEntries: logged.console,
    uncaughtErrors: logged.uncaughtErrors,
    failedRequests: requests,
    pageMetadata: details.metadata,
  };
}
