import {
  AGENT_CATALOG,
  AGENT_OPTIONS,
  agentForModelApiFormat,
  DEFAULT_AGENT_TYPE,
  getAgentLabel,
  isTestOnlyAgent,
} from "@viberglass/types";

describe("agent catalog", () => {
  it("offers every harness in the build except test-only ones, in config order", () => {
    const offered = AGENT_CATALOG.filter((entry) => !entry.testOnly).map((entry) => entry.agent);
    expect(AGENT_OPTIONS.map((option) => option.value)).toEqual(offered);
    expect(AGENT_OPTIONS.map((option) => option.value)).not.toContain("fake");
    expect(isTestOnlyAgent("fake")).toBe(true);
  });

  it("describes and labels each offered harness from its plugin", () => {
    for (const option of AGENT_OPTIONS) {
      expect(option.label).not.toBe("");
      expect(option.description).not.toBe("");
    }
  });

  it("has the build's default harness", () => {
    expect(AGENT_CATALOG.find((entry) => entry.isDefault)?.agent).toBe(DEFAULT_AGENT_TYPE);
  });

  it("labels a harness left out of the build with its id", () => {
    expect(getAgentLabel("not-in-this-build")).toBe("not-in-this-build");
    expect(getAgentLabel(null)).toBe(getAgentLabel(DEFAULT_AGENT_TYPE));
  });

  it("runs a custom endpoint on the lowest-ranked harness that speaks its format", () => {
    expect(agentForModelApiFormat("openai-chat")).toBe("opencode");
    // Pi ranks ahead of Claude Code, which also speaks Anthropic Messages but isn't ranked.
    expect(agentForModelApiFormat("anthropic-messages")).toBe("pi");
  });
});
