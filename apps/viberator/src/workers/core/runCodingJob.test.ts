import { isCodexStoredAuthFailure } from "@viberglass/agent-codex";

describe("isCodexStoredAuthFailure", () => {
  test("matches unauthorized auth failures", () => {
    expect(
      isCodexStoredAuthFailure("Codex CLI failed: unauthorized (401)"),
    ).toBe(true);
  });

  test("matches explicit login-required failures", () => {
    expect(
      isCodexStoredAuthFailure(
        "Codex CLI failed: authentication required, run codex login",
      ),
    ).toBe(true);
  });

  test("matches expired token failures", () => {
    expect(
      isCodexStoredAuthFailure(
        "Codex CLI failed: access token expired for current session",
      ),
    ).toBe(true);
  });

  test("does not match non-auth codex failures", () => {
    expect(
      isCodexStoredAuthFailure(
        "Codex CLI failed: command timed out after 120000ms",
      ),
    ).toBe(false);
  });
});
