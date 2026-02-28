import { isAllowedNativeAgentConfigPath, splitClankerConfigFiles } from "./nativeAgentConfig";

describe("nativeAgentConfig helpers", () => {
  test("accepts supported agent config paths", () => {
    expect(isAllowedNativeAgentConfigPath("codex", ".codex/config.toml")).toBe(true);
    expect(isAllowedNativeAgentConfigPath("opencode", "config/opencode.json")).toBe(true);
    expect(isAllowedNativeAgentConfigPath("qwen-cli", ".qwen/settings.json")).toBe(true);
  });

  test("splits instruction files from the native config file", () => {
    const split = splitClankerConfigFiles("opencode", [
      { fileType: "AGENTS.md", content: "instructions" },
      { fileType: "skills/review.md", content: "review" },
      { fileType: "config/opencode.json", content: '{ "model": "gpt-5" }' },
    ]);

    expect(split.instructionFiles).toEqual([
      { fileType: "AGENTS.md", content: "instructions" },
      { fileType: "skills/review.md", content: "review" },
    ]);
    expect(split.nativeConfigFile).toEqual({
      fileType: "config/opencode.json",
      content: '{ "model": "gpt-5" }',
    });
  });
});
