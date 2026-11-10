import { ranOtherModel } from "../../../../services/runRecords/ranOtherModel";

describe("ranOtherModel", () => {
  it("flags a harness that fell back to another model", () => {
    expect(ranOtherModel("opencode-go/kimi-k3.1-pro", "opencode/big-pickle")).toBe(true);
    expect(ranOtherModel("kimi-k3.1-pro", "kimi-k3")).toBe(true);
    expect(ranOtherModel("gpt-5", "gpt-5.5")).toBe(true);
  });

  it.each([
    ["the same name", "opencode-go/kimi-k3", "opencode-go/kimi-k3"],
    ["a provider in front", "deepseek-v4.1-flash", "opencode-go/deepseek-v4.1-flash"],
    ["the provider left off", "opencode-go/deepseek-v4.1-flash", "deepseek-v4.1-flash"],
    ["a nested provider", "openrouter/anthropic/claude-sonnet-5", "anthropic/claude-sonnet-5"],
    ["a variant after it", "opencode-go/kimi-k3", "opencode-go/kimi-k3/high"],
    ["a dated snapshot", "claude-haiku-5-5", "claude-haiku-5-5-20261001"],
    ["an @ snapshot", "claude-opus-5", "claude-opus-5@20260901"],
    ["a context tag", "claude-opus-5-5[1m]", "claude-opus-5-5"],
    ["a preview suffix", "gemini-3-pro", "gemini-3-pro-preview"],
    ["a picker alias", "opus", "claude-opus-5-5-20261001"],
    ["different case", "Kimi-K3", "kimi-k3"],
  ])("matches %s", (_case, requested, ran) => {
    expect(ranOtherModel(requested, ran)).toBe(false);
  });

  it("says nothing when either model is unknown", () => {
    expect(ranOtherModel(null, "opencode/big-pickle")).toBe(false);
    expect(ranOtherModel("opencode-go/kimi-k3", null)).toBe(false);
    expect(ranOtherModel(" ", "kimi-k3")).toBe(false);
  });
});
