import { CHATGPT_SIGN_IN, resolveCodexAuthSettings } from "../src/codexAuthSettings";

describe("resolveCodexAuthSettings", () => {
  const v1 = (agent: Record<string, unknown>) => ({ deploymentConfig: { version: 1, strategy: { type: "docker" }, agent } });

  test("signs in with an API key without a runner config or a sign-in", () => {
    expect(resolveCodexAuthSettings(undefined).usesChatGpt).toBe(false);
    expect(resolveCodexAuthSettings(v1({ type: "codex" })).usesChatGpt).toBe(false);
  });

  test("signs in with ChatGPT when the runner chose it, reading the login from its variable", () => {
    expect(resolveCodexAuthSettings(v1({ type: "codex", signIn: { method: "chatgpt" } }))).toEqual({
      usesChatGpt: true,
      credentialEnvVar: CHATGPT_SIGN_IN.credentialEnvVar,
    });
  });

  test("ignores another harness's sign-in", () => {
    expect(resolveCodexAuthSettings(v1({ type: "pi", signIn: { method: "chatgpt" } })).usesChatGpt).toBe(false);
  });
});
