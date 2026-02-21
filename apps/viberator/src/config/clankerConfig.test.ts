import {
  DEFAULT_CODEX_AUTH_SETTINGS,
  resolveCodexAuthSettings,
} from "./clankerConfig";

describe("resolveCodexAuthSettings", () => {
  test("uses fixed default secret name for v1 codex auth config", () => {
    const settings = resolveCodexAuthSettings({
      deploymentConfig: {
        version: 1,
        strategy: { type: "docker" },
        agent: {
          type: "codex",
          codexAuth: {
            mode: "chatgpt_device",
            secretName: "CUSTOM_SECRET",
            apiKeySecretName: "CUSTOM_API_KEY",
          },
        },
      },
    });

    expect(settings).toEqual({
      mode: "chatgpt_device",
      secretName: DEFAULT_CODEX_AUTH_SETTINGS.secretName,
      apiKeySecretName: "CUSTOM_API_KEY",
    });
  });

  test("uses fixed default secret name for legacy codex auth config", () => {
    const settings = resolveCodexAuthSettings({
      deploymentConfig: {
        codexAuth: {
          mode: "chatgpt_device",
          secretName: "LEGACY_CUSTOM_SECRET",
        },
      },
    });

    expect(settings.secretName).toBe(DEFAULT_CODEX_AUTH_SETTINGS.secretName);
  });

  test("accepts chatgpt_device_stored mode", () => {
    const settings = resolveCodexAuthSettings({
      deploymentConfig: {
        version: 1,
        strategy: { type: "docker" },
        agent: {
          type: "codex",
          codexAuth: {
            mode: "chatgpt_device_stored",
          },
        },
      },
    });

    expect(settings.mode).toBe("chatgpt_device_stored");
  });
});
