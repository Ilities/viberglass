import { AppOrigins, isAppHostLabel } from "../../../../services/apps/AppOrigins";
import { appReturnPath } from "../../../../services/apps/appReturnPath";

describe("AppOrigins", () => {
  it("serves apps over https on the apps domain unless APPS_PUBLIC_URL says otherwise", () => {
    expect(new AppOrigins({ APPS_DOMAIN: "*.apps.example.com" }).originFor("laptops")).toBe("https://laptops.apps.example.com");
    const local = new AppOrigins({ APPS_DOMAIN: "apps.localhost", APPS_PUBLIC_URL: "http://apps.localhost:8891" });
    expect(local.originFor("laptops")).toBe("http://laptops.apps.localhost:8891");
    expect(local.secure).toBe(false);
  });

  it("has no origins without an apps domain, or for slugs that can't be host names", () => {
    expect(new AppOrigins({}).originFor("laptops")).toBeNull();
    expect(new AppOrigins({ APPS_DOMAIN: "apps.example.com" }).originFor("laptop_tracker")).toBeNull();
  });

  it("reads the slug from one level under the apps domain only", () => {
    const origins = new AppOrigins({ APPS_DOMAIN: "apps.example.com" });
    expect(origins.slugFromHost("Laptops.Apps.Example.com:8891")).toBe("laptops");
    expect(origins.slugFromHost("apps.example.com")).toBeNull();
    expect(origins.slugFromHost("a.b.apps.example.com")).toBeNull();
    expect(origins.slugFromHost("laptops.apps.example.com.evil.test")).toBeNull();
    expect(origins.slugFromHost(undefined)).toBeNull();
  });

  it("takes host labels of up to 63 letters, digits and inner hyphens", () => {
    expect(isAppHostLabel("laptop-tracker-2")).toBe(true);
    for (const bad of ["-laptops", "laptops-", "laptop_tracker", "a".repeat(64), ""]) expect(isAppHostLabel(bad)).toBe(false);
  });
});

describe("appReturnPath", () => {
  it("keeps paths on the app's own host", () => {
    expect(appReturnPath("/laptops?status=lent#top")).toBe("/laptops?status=lent#top");
  });

  it("turns anything that could leave the host into /", () => {
    for (const bad of ["//evil.test", "/\\evil.test", "https://evil.test", "evil", "/a\\b", "/a\nb", 42, undefined, `/${"a".repeat(2048)}`]) {
      expect(appReturnPath(bad)).toBe("/");
    }
  });
});
