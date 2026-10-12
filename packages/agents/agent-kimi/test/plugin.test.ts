import kimiCodePlugin from "../src/plugin";

describe("kimi-code plugin", () => {
  it("doesn't pin a model, so Kimi Code's own default applies", () => {
    expect(kimiCodePlugin.defaultConfig).not.toHaveProperty("model");
  });
});
