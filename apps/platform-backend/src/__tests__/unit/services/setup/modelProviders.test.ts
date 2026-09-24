import {
  AGENT_PROVIDER_BINDINGS,
  MODEL_PROVIDERS,
  describeModelKeyFormatProblem,
  getDefaultAgentBindingForProvider,
  guessModelProviderFromKey,
} from "@viberglass/types";

describe("model provider catalog", () => {
  it("gives every provider a default harness the platform can run", () => {
    for (const provider of MODEL_PROVIDERS) {
      expect(getDefaultAgentBindingForProvider(provider.id)).toBeDefined();
    }
  });

  it("runs OpenCode Go keys on OpenCode with an OpenCode Go model", () => {
    expect(getDefaultAgentBindingForProvider("opencode-go")).toMatchObject({
      agent: "opencode",
      envVar: "OPENCODE_API_KEY",
      model: expect.stringMatching(/^opencode-go\//),
    });
  });

  it("leaves out agents the platform can't select yet", () => {
    expect(AGENT_PROVIDER_BINDINGS.some((binding) => String(binding.agent) === "pi")).toBe(false);
  });
});

describe("guessModelProviderFromKey", () => {
  it.each([
    ["sk-ant-api03-abc", "anthropic"],
    ["sk-or-v1-abc", "openrouter"],
    ["sk-sp-abc", "alibaba-coding-plan"],
    ["AIzaSyabc", "google"],
    ["gsk_abc", "groq"],
    ["xai-abc", "xai"],
  ])("recognises %s as %s", (key, provider) => {
    expect(guessModelProviderFromKey(key)?.id).toBe(provider);
  });

  it("doesn't guess for a generic sk- key", () => {
    expect(guessModelProviderFromKey("sk-proj-abc")).toBeUndefined();
  });
});

describe("describeModelKeyFormatProblem", () => {
  it("accepts a generic key for a provider without a distinctive prefix", () => {
    expect(describeModelKeyFormatProblem("openai", "sk-proj-abc")).toBeNull();
  });

  it("names the provider a key really belongs to", () => {
    expect(describeModelKeyFormatProblem("openai", "sk-ant-api03-abc")).toBe(
      "This looks like a key from Anthropic, not OpenAI.",
    );
  });

  it("explains a distinctive prefix that's missing", () => {
    expect(describeModelKeyFormatProblem("anthropic", "sk-proj-abc")).toBe(
      "Anthropic keys start with sk-ant-.",
    );
  });

  it("catches pasted whitespace inside the key", () => {
    expect(describeModelKeyFormatProblem("openai", "sk-abc def")).toMatch(/spaces/);
  });
});
