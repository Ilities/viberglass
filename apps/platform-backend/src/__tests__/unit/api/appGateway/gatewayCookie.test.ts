import {
  gatewayClearCookie,
  gatewayCookieNames,
  gatewaySetCookie,
  readGatewayCookies,
  withoutGatewayCookies,
  withoutGatewaySetCookie,
} from "../../../../api/appGateway/gatewayCookie";

const NAMES = gatewayCookieNames(false);

describe("the gateway cookie", () => {
  it("reads every value sent under its name", () => {
    expect(readGatewayCookies("theme=dark; viberglass_app=one; viberglass_app=two", "viberglass_app")).toEqual(["one", "two"]);
    expect(readGatewayCookies(undefined, "viberglass_app")).toEqual([]);
  });

  it("is removed from what the app receives, leaving the app's own cookies", () => {
    expect(withoutGatewayCookies("theme=dark; viberglass_app=one; viberglass_app_state=s; sid=x=y", NAMES)).toBe("theme=dark; sid=x=y");
    expect(withoutGatewayCookies("viberglass_app=one", NAMES)).toBeUndefined();
  });

  it("can't be set by the app, not even as a nameless cookie that reads back as ours", () => {
    expect(
      withoutGatewaySetCookie(["viberglass_app=forged; Path=/", " viberglass_app_state = s", "=viberglass_app=X", "viberglass_app", "theme=dark"], NAMES),
    ).toEqual(["theme=dark"]);
  });

  it("is cleared on the host, or on the apps domain when a sibling may have set it there", () => {
    expect(gatewayClearCookie("viberglass_app", false, "apps.localhost")).toBe("viberglass_app=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Domain=apps.localhost");
    expect(gatewayClearCookie("__Host-viberglass_app", true)).toBe("__Host-viberglass_app=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  });

  it("is host-only and http-only, and secure over https", () => {
    const cookie = gatewaySetCookie("__Host-viberglass_app", "token", new Date(Date.now() + 60_000), true);
    expect(cookie).toMatch(/^__Host-viberglass_app=token; Path=\/; Max-Age=(59|60); HttpOnly; SameSite=Lax; Secure$/);
    expect(cookie).not.toContain("Domain");
  });
});
