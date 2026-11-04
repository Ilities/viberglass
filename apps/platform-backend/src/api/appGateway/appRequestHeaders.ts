import type { IncomingMessage } from "http";
import { APP_USER_HEADERS } from "@viberglass/types";
import type { AppSessionUser } from "../../persistence/apps/AppSignInDAO";
import { type GatewayCookieNames, withoutGatewayCookies } from "./gatewayCookie";

// Some servers read "_" as "-", so x_viberglass_user_id could pose as the real header.
function sentByClientOnly(name: string): boolean {
  return name.startsWith("x-viberglass-") || name.includes("_") || name.startsWith("x-forwarded-") || name === "forwarded";
}

/**
 * What the app receives: the person's identity and the gateway's own view of
 * the request, in place of anything the browser sent under those names.
 */
export function prepareAppRequest(req: IncomingMessage, user: AppSessionUser, options: { cookieNames: GatewayCookieNames; secure: boolean }): void {
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

  if (req.socket.remoteAddress) req.headers["x-forwarded-for"] = req.socket.remoteAddress;
  req.headers["x-forwarded-proto"] = options.secure ? "https" : "http";
  if (req.headers.host) req.headers["x-forwarded-host"] = req.headers.host;
}
