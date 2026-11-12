import { demoSignIn } from "../../../config/demoInstance";

describe("demoSignIn", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns the viewer's sign-in on a demo instance", () => {
    process.env.VIBERGLASS_DEMO = "true";
    process.env.DEMO_VIEWER_EMAIL = " demo@viberglass.io ";
    process.env.DEMO_VIEWER_PASSWORD = "viberglass-demo";

    expect(demoSignIn()).toEqual({ email: "demo@viberglass.io", password: "viberglass-demo" });
  });

  it("returns nothing outside demo mode, even when the viewer is configured", () => {
    delete process.env.VIBERGLASS_DEMO;
    process.env.DEMO_VIEWER_EMAIL = "demo@viberglass.io";
    process.env.DEMO_VIEWER_PASSWORD = "viberglass-demo";

    expect(demoSignIn()).toBeUndefined();
  });

  it("returns nothing when the password is missing", () => {
    process.env.VIBERGLASS_DEMO = "true";
    process.env.DEMO_VIEWER_EMAIL = "demo@viberglass.io";
    delete process.env.DEMO_VIEWER_PASSWORD;

    expect(demoSignIn()).toBeUndefined();
  });
});
