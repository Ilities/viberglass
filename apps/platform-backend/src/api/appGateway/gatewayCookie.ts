export interface GatewayCookieNames {
  /** The person's gateway session on this app. */
  session: string;
  /** Ties a sign-in to the browser that started it. */
  state: string;
}

/**
 * The gateway's own cookies on an app's host. Over https they're `__Host-`
 * cookies, which the browser keeps to that one host and never lets a sibling app set.
 */
export function gatewayCookieNames(secure: boolean): GatewayCookieNames {
  const prefix = secure ? "__Host-" : "";
  return { session: `${prefix}viberglass_app`, state: `${prefix}viberglass_app_state` };
}

function pairs(header: string | undefined): Array<{ name: string; value: string; raw: string }> {
  if (!header) return [];
  return header
    .split(";")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const index = raw.indexOf("=");
      return index < 0 ? { name: raw, value: "", raw } : { name: raw.slice(0, index).trim(), value: raw.slice(index + 1).trim(), raw };
    });
}

/** Every value sent under one name; a cookie set for a parent domain can arrive next to ours. */
export function readGatewayCookies(header: string | undefined, name: string): string[] {
  return pairs(header).filter((pair) => pair.name === name && pair.value).map((pair) => pair.value);
}

/** The Cookie header the app gets: everything but the gateway's cookies. */
export function withoutGatewayCookies(header: string | undefined, names: GatewayCookieNames): string | undefined {
  const kept = pairs(header).filter((pair) => pair.name !== names.session && pair.name !== names.state).map((pair) => pair.raw);
  return kept.length > 0 ? kept.join("; ") : undefined;
}

export function gatewaySetCookie(name: string, token: string, expiresAt: Date, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [`${name}=${token}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}

/** Clears a cookie on the host, or on a parent domain when one is given (only possible without `__Host-`). */
export function gatewayClearCookie(name: string, secure: boolean, domain?: string): string {
  return [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(domain ? [`Domain=${domain}`] : []), ...(secure ? ["Secure"] : [])].join("; ");
}

// Read the way browsers do: a pair without "=" is a nameless cookie, which
// comes back in the Cookie header as just its value, so it could pose as any name.
function setCookieName(value: string): string {
  const pair = value.split(";", 1)[0] ?? "";
  const index = pair.indexOf("=");
  return index < 0 ? "" : pair.slice(0, index).trim();
}

/** Drops any attempt by the app to set the gateway's cookies itself, including nameless ones. */
export function withoutGatewaySetCookie(values: string[] | undefined, names: GatewayCookieNames): string[] | undefined {
  if (!values) return values;
  return values.filter((value) => {
    const name = setCookieName(value);
    return name !== "" && name !== names.session && name !== names.state;
  });
}
