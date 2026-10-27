import { checkedSettings } from "../scripts/settingValidation";

const validString = {
  key: "model",
  label: "Model",
  type: "string",
  env: ["MODEL"],
};

const validSelect = {
  key: "endpoint",
  label: "Endpoint",
  type: "select",
  options: [{ value: "https://example.com", label: "Example" }],
  env: ["ENDPOINT"],
};

describe("checkedSettings", () => {
  it("accepts string settings without form-only options", () => {
    expect(checkedSettings("plugin", [validString])).toEqual([validString]);
  });

  it("accepts select settings with options", () => {
    expect(checkedSettings("plugin", [validSelect])).toEqual([validSelect]);
  });

  it("rejects options on a string setting", () => {
    expect(() =>
      checkedSettings("plugin", [
        { ...validString, options: [{ value: "a", label: "A" }] },
      ]),
    ).toThrow("Plugin plugin setting 'model' is a string, so it can't take options or allowCustom.");
  });

  it("rejects allowCustom on a string setting", () => {
    expect(() =>
      checkedSettings("plugin", [{ ...validString, allowCustom: true }]),
    ).toThrow("Plugin plugin setting 'model' is a string, so it can't take options or allowCustom.");
  });

  it("rejects a select setting without options", () => {
    expect(() =>
      checkedSettings("plugin", [{ ...validSelect, options: undefined }]),
    ).toThrow("Plugin plugin setting 'endpoint' is a select with no options.");
  });

  it("rejects a select setting with an empty options list", () => {
    expect(() =>
      checkedSettings("plugin", [{ ...validSelect, options: [] }]),
    ).toThrow("Plugin plugin setting 'endpoint' is a select with no options.");
  });
});
