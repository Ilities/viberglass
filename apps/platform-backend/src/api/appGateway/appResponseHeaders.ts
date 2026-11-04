import type { IncomingHttpHeaders } from "http";
import { type GatewayCookieNames, withoutGatewaySetCookie } from "./gatewayCookie";

// Added as its own policy: browsers enforce every policy sent, so an app's stricter one still holds.
const FRAMED_BY_ITSELF_ONLY = "frame-ancestors 'self'";

/**
 * What the browser gets from the app: never the gateway's cookies, no frames
 * from other apps, and no CORS grants to another origin.
 */
export function guardAppResponse(headers: IncomingHttpHeaders, options: { cookieNames: GatewayCookieNames; origin: string | null }): void {
  headers["set-cookie"] = withoutGatewaySetCookie(headers["set-cookie"], options.cookieNames);

  const allowed = headers["access-control-allow-origin"];
  if (allowed !== undefined && allowed !== options.origin) {
    delete headers["access-control-allow-origin"];
    delete headers["access-control-allow-credentials"];
  }

  const policies = headers["content-security-policy"];
  headers["content-security-policy"] = [...(policies === undefined ? [] : [policies].flat()), FRAMED_BY_ITSELF_ONLY];
}
