/**
 * The gateway's own cookie on an app's host. Over https it's a `__Host-` cookie,
 * which the browser keeps to that one host and never lets a sibling app set.
 */
export function gatewayCookieName(secure: boolean): string {
  return secure ? "__Host-viberglass_app" : "viberglass_app";
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

/** Every value sent under the gateway's name; a cookie set for a parent domain can arrive next to ours. */
export function readGatewayCookies(header: string | undefined, name: string): string[] {
  return pairs(header).filter((pair) => pair.name === name && pair.value).map((pair) => pair.value);
}

/** The Cookie header the app gets: everything but the gateway's cookie. */
export function withoutGatewayCookie(header: string | undefined, name: string): string | undefined {
  const kept = pairs(header).filter((pair) => pair.name !== name).map((pair) => pair.raw);
  return kept.length > 0 ? kept.join("; ") : undefined;
}

export function gatewaySetCookie(name: string, token: string, expiresAt: Date, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [`${name}=${token}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}

/** Drops any attempt by the app to set the gateway's cookie itself. */
export function withoutGatewaySetCookie(values: string[] | undefined, name: string): string[] | undefined {
  if (!values) return values;
  return values.filter((value) => value.split("=", 1)[0]?.trim() !== name);
}
