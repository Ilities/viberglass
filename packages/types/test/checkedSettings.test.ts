import { checkedSettings } from "../src/agentSettings";

const ENV = ["SOME_ENV"];

function setting(overrides: Record<string, unknown>): Record<string, unknown> {
  return { key: "model", label: "Model", type: "string", env: ENV, ...overrides };
}

describe("checkedSettings", () => {
  it("returns the settings a plugin declares", () => {
    const settings = checkedSettings("pkg", [
      setting({}),
      setting({ key: "region", type: "select", options: [{ value: "eu", label: "EU" }] }),
    ]);
    expect(settings.map((s) => s.key)).toEqual(["model", "region"]);
  });

  it("accepts no settings at all", () => {
    expect(checkedSettings("pkg", undefined)).toEqual([]);
  });

  it("rejects options on a string setting, naming the plugin and key", () => {
    expect(() => checkedSettings("pkg", [setting({ options: [{ value: "a", label: "A" }] })])).toThrow(
      /pkg.*'model'.*string.*options/,
    );
  });

  it("rejects allowCustom on a string setting, naming the plugin and key", () => {
    expect(() => checkedSettings("pkg", [setting({ allowCustom: true })])).toThrow(
      /pkg.*'model'.*string.*allowCustom/,
    );
  });

  it("rejects a select with no options, naming the plugin and key", () => {
    expect(() => checkedSettings("pkg", [setting({ type: "select" })])).toThrow(
      /pkg.*'model'.*select.*option/,
    );
  });

  it("rejects a select with an empty options list", () => {
    expect(() => checkedSettings("pkg", [setting({ type: "select", options: [] })])).toThrow(
      /pkg.*'model'.*select.*option/,
    );
  });

  it("still rejects a reserved or repeated key", () => {
    expect(() => checkedSettings("pkg", [setting({ key: "type" })])).toThrow(/'type'/);
    expect(() => checkedSettings("pkg", [setting({}), setting({ label: "Other" })])).toThrow(/'model'/);
  });

  it("still rejects a malformed setting", () => {
    expect(() => checkedSettings("pkg", [setting({ env: undefined })])).toThrow(/malformed setting/);
  });
});
