import {
  parseDeviceAuthValues,
  sanitizeCliOutputLine,
} from "./CodexAuthManager";

describe("CodexAuthManager device auth parsing", () => {
  test("removes ANSI control sequences from CLI lines", () => {
    const sanitized = sanitizeCliOutputLine(
      "\u001b[32mhttps://auth.openai.com/codex/device\u001b[0m",
    );

    expect(sanitized).toBe("https://auth.openai.com/codex/device");
  });

  test("extracts verification URL and user code from formatted device auth line", () => {
    const parsed = parseDeviceAuthValues(
      "\u001b[32mOpen https://auth.openai.com/codex/device and enter code abcd-efgh\u001b[0m",
    );

    expect(parsed).toEqual({
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
    });
  });

  test("does not accept plain words as device code", () => {
    const parsed = parseDeviceAuthValues(
      "Waiting for Codex device authorization",
    );

    expect(parsed.userCode).toBeUndefined();
  });

  test("does not parse invalid enter-code value", () => {
    const parsed = parseDeviceAuthValues("Enter code authorization");

    expect(parsed.userCode).toBeUndefined();
  });

  test("parses URL and device code from actual codex login transcript lines", () => {
    const uriLine =
      "   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\r";
    const codeLine = "   \u001b[94mABC1-ABCDE\u001b[0m\r";

    const parsedUri = parseDeviceAuthValues(uriLine);
    const parsedCode = parseDeviceAuthValues(codeLine);

    expect(parsedUri.verificationUri).toBe(
      "https://auth.openai.com/codex/device",
    );
    expect(parsedCode.userCode).toBe("ABC1-ABCDE");
  });
});
