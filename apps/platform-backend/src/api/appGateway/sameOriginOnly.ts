import type { IncomingMessage } from "http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Opening the app in a tab or window, from a link or a redirect; not a frame and not a script. */
function topLevelNavigation(req: IncomingMessage): boolean {
  const dest = req.headers["sec-fetch-dest"];
  return req.headers["sec-fetch-mode"] === "navigate" && (dest === undefined || dest === "document");
}

/**
 * Sibling apps share a site, so SameSite cookies don't stop one app's page from
 * reading, framing or writing to another. Other sites may only open the app;
 * changes and websockets must come from the app's own origin.
 */
export function refusedAsCrossOrigin(req: IncomingMessage, upgrade: boolean): boolean {
  const fetchSite = req.headers["sec-fetch-site"];
  const fromElsewhere = typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none";
  if (!upgrade && SAFE_METHODS.has(req.method ?? "GET")) return fromElsewhere && !topLevelNavigation(req);
  if (fromElsewhere) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host?.toLowerCase();
  } catch {
    return true;
  }
}
