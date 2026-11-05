import type { IncomingMessage } from "http";
import { APP_USER_HEADERS } from "@viberglass/types";
import type { AppSessionUser } from "../../persistence/apps/AppSignInDAO";
import { type GatewayCookieNames, withoutGatewayCookies } from "./gatewayCookie";

// Some servers read "_" as "-", so x_viberglass_user_id could pose as the real header.
function sentByClientOnly(name: string): boolean {
  return name.startsWith("x-viberglass-") || name.includes("_") || name.startsWith("x-forwarded-") || name === "forwarded";
}

// A proxy appends the address it saw; anything before that came from the client.
function addressFromProxy(value: string | string[] | undefined): string | null {
  const last = (Array.isArray(value) ? value.join(",") : (value ?? "")).split(",").at(-1)?.trim();
  return last || null;
}

/**
 * What the app receives: the person's identity and the gateway's own view of
 * the request, in place of anything the browser sent under those names. Behind
 * a proxy (`trustProxy`), the person's address is the one the proxy appended.
 */
export function prepareAppRequest(
  req: IncomingMessage,
  user: AppSessionUser,
  options: { cookieNames: GatewayCookieNames; secure: boolean; trustProxy?: boolean },
): void {
  const address = (options.trustProxy ? addressFromProxy(req.headers["x-forwarded-for"]) : null) ?? req.socket.remoteAddress;
  for (const name of Object.keys(req.headers)) {
    if (sentByClientOnly(name)) delete req.headers[name];
  }
  const cookie = withoutGatewayCookies(req.headers.cookie, options.cookieNames);
  if (cookie) req.headers.cookie = cookie;
  else delete req.headers.cookie;

  req.headers[APP_USER_HEADERS.id.toLowerCase()] = user.id;
  req.headers[APP_USER_HEADERS.email.toLowerCase()] = user.email;
  // Header values are Latin-1, and names can be in any script.
  req.headers[APP_USER_HEADERS.name.toLowerCase()] = encodeURIComponent(user.name);

  if (address) req.headers["x-forwarded-for"] = address;
  req.headers["x-forwarded-proto"] = options.secure ? "https" : "http";
  if (req.headers.host) req.headers["x-forwarded-host"] = req.headers.host;
}
