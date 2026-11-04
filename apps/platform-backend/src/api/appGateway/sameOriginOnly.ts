import type { IncomingMessage } from "http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Sibling apps share a site, so SameSite cookies don't stop one app's page from
 * writing to another. Changes and websockets must come from the app's own origin.
 */
export function refusedAsCrossOrigin(req: IncomingMessage, upgrade: boolean): boolean {
  if (!upgrade && SAFE_METHODS.has(req.method ?? "GET")) return false;
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host?.toLowerCase();
  } catch {
    return true;
  }
}
