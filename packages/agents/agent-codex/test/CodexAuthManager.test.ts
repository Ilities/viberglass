import {
  compactJsonForStorage,
  decodeCodexAuthFromSharedValue,
  normalizeCodexHomeEnv,
  parseDeviceAuthValues,
  sanitizeCliOutputLine,
} from "../src/CodexAuthManager";
import { gzipSync } from "node:zlib";

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

  test("compacts pretty JSON auth payload before upload", () => {
    const prettyJson = JSON.stringify(
      {
        account_id: "acct_123",
        auth: {
          access_token: "token",
          refresh_token: "refresh",
        },
      },
      null,
      2,
    );

    const compacted = compactJsonForStorage(prettyJson);

    expect(compacted).toBe(
      '{"account_id":"acct_123","auth":{"access_token":"token","refresh_token":"refresh"}}',
    );
    expect(Buffer.byteLength(compacted, "utf-8")).toBeLessThan(
      Buffer.byteLength(prettyJson, "utf-8"),
    );
  });

  test("returns trimmed value when auth payload is not valid JSON", () => {
    expect(compactJsonForStorage("  not-json  ")).toBe("not-json");
  });

  test("decodes compressed shared SSM auth payload", () => {
    const json = '{"account_id":"acct_123","token":"abc"}';
    const encoded = `gz+b64:${gzipSync(Buffer.from(json, "utf-8")).toString("base64")}`;

    expect(decodeCodexAuthFromSharedValue(encoded)).toBe(json);
  });

  test("passes through uncompressed shared auth payload", () => {
    const json = '{"account_id":"acct_123"}';
    expect(decodeCodexAuthFromSharedValue(json)).toBe(json);
  });

  test("normalizes legacy CODEX_CONFIG_DIR into CODEX_HOME", () => {
    const env: NodeJS.ProcessEnv = {
      CODEX_CONFIG_DIR: "/tmp/codex-config",
    };

    normalizeCodexHomeEnv(env);

    expect(env.CODEX_HOME).toBe("/tmp/codex-config");
  });

  test("does not override existing CODEX_HOME", () => {
    const env: NodeJS.ProcessEnv = {
      CODEX_HOME: "/tmp/codex-home",
      CODEX_CONFIG_DIR: "/tmp/codex-config",
    };

    normalizeCodexHomeEnv(env);

    expect(env.CODEX_HOME).toBe("/tmp/codex-home");
  });
});
