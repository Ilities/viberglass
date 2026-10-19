import { authCookieIsSecure } from "../../../../api/auth/utils";

describe("authCookieIsSecure", () => {
  const original = {
    url: process.env.PLATFORM_FRONTEND_URL,
    nodeEnv: process.env.NODE_ENV,
  };

  afterEach(() => {
    if (original.url === undefined) delete process.env.PLATFORM_FRONTEND_URL;
    else process.env.PLATFORM_FRONTEND_URL = original.url;
    process.env.NODE_ENV = original.nodeEnv;
  });

  it("is secure when the app is served over HTTPS", () => {
    process.env.PLATFORM_FRONTEND_URL = "https://viberglass.example.com";
    process.env.NODE_ENV = "development";
    expect(authCookieIsSecure()).toBe(true);
  });

  it("is not secure for a production build served on http://localhost", () => {
    process.env.PLATFORM_FRONTEND_URL = "http://localhost:3000";
    process.env.NODE_ENV = "production";
    expect(authCookieIsSecure()).toBe(false);
  });

  it("follows NODE_ENV when the app's address is unset", () => {
    delete process.env.PLATFORM_FRONTEND_URL;
    process.env.NODE_ENV = "production";
    expect(authCookieIsSecure()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(authCookieIsSecure()).toBe(false);
  });
});
