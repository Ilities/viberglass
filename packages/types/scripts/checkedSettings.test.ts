import { checkedSettings } from "./checkedSettings";

const packageName = "@viberglass/agent-example";

describe("checkedSettings", () => {
  it("keeps a string setting and a select with options", () => {
    const settings = checkedSettings(packageName, [
      {
        key: "model",
        label: "Model",
        type: "string",
        placeholder: "kimi-k3",
        providerDefault: "model",
        env: ["KIMI_MODEL_NAME"],
      },
      {
        key: "endpoint",
        label: "Endpoint",
        type: "select",
        options: [{ value: "https://dashscope.aliyuncs.com", label: "Mainland China" }],
        allowCustom: true,
        providerDefault: "endpoint",
        env: ["QWEN_CLI_ENDPOINT"],
      },
    ]);
    expect(settings).toHaveLength(2);
  });

  it("rejects options on a string setting, naming the package and the key", () => {
    expect(() =>
      checkedSettings(packageName, [
        { key: "model", label: "Model", type: "string", options: [{ value: "a", label: "A" }], env: ["MODEL"] },
      ]),
    ).toThrow(
      `Plugin ${packageName} can't use options or allowCustom on the string setting 'model': the runner form shows a string as a plain text input.`,
    );
  });

  it("rejects allowCustom on a string setting, naming the package and the key", () => {
    expect(() =>
      checkedSettings(packageName, [
        { key: "model", label: "Model", type: "string", allowCustom: true, env: ["MODEL"] },
      ]),
    ).toThrow(
      `Plugin ${packageName} can't use options or allowCustom on the string setting 'model'`,
    );
  });

  it("rejects a select with no options, naming the package and the key", () => {
    expect(() =>
      checkedSettings(packageName, [
        { key: "endpoint", label: "Endpoint", type: "select", env: ["ENDPOINT"] },
      ]),
    ).toThrow(
      `Plugin ${packageName} needs options on the select setting 'endpoint': a select with none renders an empty dropdown.`,
    );
  });

  it("rejects a select with an empty options list", () => {
    expect(() =>
      checkedSettings(packageName, [
        { key: "endpoint", label: "Endpoint", type: "select", options: [], env: ["ENDPOINT"] },
      ]),
    ).toThrow(`Plugin ${packageName} needs options on the select setting 'endpoint'`);
  });

  it("still rejects a reserved or repeated setting key", () => {
    expect(() =>
      checkedSettings(packageName, [
        { key: "type", label: "Type", type: "string", env: ["TYPE"] },
      ]),
    ).toThrow(`Plugin ${packageName} can't use the setting key 'type'`);
    expect(() =>
      checkedSettings(packageName, [
        { key: "model", label: "Model", type: "string", env: ["A"] },
        { key: "model", label: "Model again", type: "string", env: ["B"] },
      ]),
    ).toThrow(`Plugin ${packageName} can't use the setting key 'model'`);
  });

  it("returns no settings when the plugin declares none", () => {
    expect(checkedSettings(packageName, undefined)).toEqual([]);
  });
});
