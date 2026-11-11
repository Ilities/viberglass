import type { FailedRequest } from "@/types";

/** The most failures kept per tab; the latest ones. */
const LIMIT = 50;

const keyOf = (tabId: number) => `failedRequests:${tabId}`;

// The service worker can stop between events, so the lists live in session storage.
// Updates go one at a time, so two failures at once don't overwrite each other.
let pending: Promise<unknown> = Promise.resolve();

function update(tabId: number, change: (list: FailedRequest[]) => FailedRequest[]): void {
  pending = pending
    .then(async () => {
      const key = keyOf(tabId);
      const stored = (await chrome.storage.session.get(key))[key];
      await chrome.storage.session.set({ [key]: change(Array.isArray(stored) ? stored : []).slice(-LIMIT) });
    })
    .catch(() => undefined);
}

function record(tabId: number, request: FailedRequest): void {
  if (tabId < 0) return;
  update(tabId, (list) => [...list, request]);
}

/**
 * Keeps each tab's failed requests since its page loaded, with their real
 * method: error statuses, and requests the browser couldn't complete, such as
 * the resource loads it reports as "Failed to load resource".
 */
export function recordFailedRequests(): void {
  const all = { urls: ["<all_urls>"] };
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId >= 0) update(details.tabId, () => []);
    },
    { ...all, types: ["main_frame"] },
  );
  chrome.webRequest.onCompleted.addListener((details) => {
    if (details.statusCode < 400) return;
    record(details.tabId, {
      method: details.method,
      url: details.url,
      status: details.statusCode,
      timestamp: new Date(details.timeStamp).toISOString(),
    });
  }, all);
  chrome.webRequest.onErrorOccurred.addListener((details) => {
    // Cancelled loads, such as when the page navigates away, aren't failures.
    if (details.error === "net::ERR_ABORTED") return;
    record(details.tabId, {
      method: details.method,
      url: details.url,
      error: details.error,
      timestamp: new Date(details.timeStamp).toISOString(),
    });
  }, all);
  chrome.tabs.onRemoved.addListener((tabId) => {
    pending = pending.then(() => chrome.storage.session.remove(keyOf(tabId))).catch(() => undefined);
  });
}

/** The tab's failed requests since its page loaded, oldest first. */
export async function failedRequestsOf(tabId: number): Promise<FailedRequest[]> {
  await pending;
  const key = keyOf(tabId);
  const stored = (await chrome.storage.session.get(key))[key];
  return Array.isArray(stored) ? stored : [];
}
