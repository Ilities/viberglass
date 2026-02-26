import {
  DEFAULT_CODEX_AUTH_SETTINGS,
  resolveCodexAuthSettings,
} from "./clankerConfig";

describe("resolveCodexAuthSettings", () => {
  test("uses defaults when clanker config is missing", () => {
    expect(resolveCodexAuthSettings(undefined)).toEqual(
      DEFAULT_CODEX_AUTH_SETTINGS,
    );
  });

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

  test("rejects legacy codex auth config", () => {
    expect(() =>
      resolveCodexAuthSettings({
        deploymentConfig: {
          codexAuth: {
            mode: "chatgpt_device",
            secretName: "LEGACY_CUSTOM_SECRET",
          },
        },
      }),
    ).toThrow(
      "Unsupported Codex auth config: expected v1 deployment config with agent.type='codex'",
    );
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

  test("resolves codex auth from raw deployment config payload", () => {
    const settings = resolveCodexAuthSettings({
      version: 1,
      strategy: { type: "ecs" },
      agent: {
        type: "codex",
        codexAuth: {
          mode: "chatgpt_device_stored",
        },
      },
    });

    expect(settings).toEqual({
      mode: "chatgpt_device_stored",
      secretName: DEFAULT_CODEX_AUTH_SETTINGS.secretName,
      apiKeySecretName: DEFAULT_CODEX_AUTH_SETTINGS.apiKeySecretName,
    });
  });
});
