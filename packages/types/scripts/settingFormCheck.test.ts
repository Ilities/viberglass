import { readSettingFields } from "../src/agentSettings";
import { assertSettingRenderable } from "./settingFormCheck";

/** Mirrors the generator: parse the declared settings, then check each against its declaration. */
function check(raw: unknown[]): void {
  const settings = readSettingFields(raw);
  settings.forEach((setting, index) => assertSettingRenderable("@test/agent-x", setting, raw[index]));
}

const base = { label: "Label", env: ["X_ENV"] };

describe("assertSettingRenderable", () => {
  it("accepts a plain string setting", () => {
    expect(() => check([{ key: "model", type: "string", ...base }])).not.toThrow();
  });

  it("accepts a select with options", () => {
    expect(() =>
      check([{ key: "mode", type: "select", options: [{ value: "a", label: "A" }], ...base }]),
    ).not.toThrow();
  });

  it("accepts a select that allows custom values", () => {
    expect(() =>
      check([{ key: "mode", type: "select", options: [{ value: "a", label: "A" }], allowCustom: true, ...base }]),
    ).not.toThrow();
  });

  it("rejects options on a string setting, naming the package and key", () => {
    expect(() =>
      check([{ key: "model", type: "string", options: [{ value: "a", label: "A" }], ...base }]),
    ).toThrow(/Plugin @test\/agent-x setting 'model' is a string, which ignores options/);
  });

  it("rejects an empty options list on a string setting", () => {
    expect(() => check([{ key: "model", type: "string", options: [], ...base }])).toThrow(
      /setting 'model' is a string, which ignores options/,
    );
  });

  it("rejects allowCustom on a string setting, naming the package and key", () => {
    expect(() => check([{ key: "model", type: "string", allowCustom: true, ...base }])).toThrow(
      /Plugin @test\/agent-x setting 'model' is a string, which ignores allowCustom/,
    );
  });

  it("rejects a select with no options, naming the package and key", () => {
    expect(() => check([{ key: "mode", type: "select", ...base }])).toThrow(
      /Plugin @test\/agent-x setting 'mode' is a select with no options/,
    );
  });

  it("rejects a select whose options are all malformed", () => {
    expect(() => check([{ key: "mode", type: "select", options: [{ value: 1 }], ...base }])).toThrow(
      /setting 'mode' is a select with no options/,
    );
  });
});
