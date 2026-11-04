import {
  gatewaySetCookie,
  readGatewayCookies,
  withoutGatewayCookie,
  withoutGatewaySetCookie,
} from "../../../../api/appGateway/gatewayCookie";

describe("the gateway cookie", () => {
  it("reads every value sent under its name", () => {
    expect(readGatewayCookies("theme=dark; viberglass_app=one; viberglass_app=two", "viberglass_app")).toEqual(["one", "two"]);
    expect(readGatewayCookies(undefined, "viberglass_app")).toEqual([]);
  });

  it("is removed from what the app receives, leaving the app's own cookies", () => {
    expect(withoutGatewayCookie("theme=dark; viberglass_app=one; sid=x=y", "viberglass_app")).toBe("theme=dark; sid=x=y");
    expect(withoutGatewayCookie("viberglass_app=one", "viberglass_app")).toBeUndefined();
  });

  it("can't be set by the app", () => {
    expect(withoutGatewaySetCookie(["viberglass_app=forged; Path=/", "theme=dark"], "viberglass_app")).toEqual(["theme=dark"]);
  });

  it("is host-only and http-only, and secure over https", () => {
    const cookie = gatewaySetCookie("__Host-viberglass_app", "token", new Date(Date.now() + 60_000), true);
    expect(cookie).toMatch(/^__Host-viberglass_app=token; Path=\/; Max-Age=(59|60); HttpOnly; SameSite=Lax; Secure$/);
    expect(cookie).not.toContain("Domain");
  });
});
