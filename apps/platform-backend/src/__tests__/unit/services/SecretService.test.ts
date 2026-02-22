import {
  compactJsonForStorage,
  encodeCodexAuthForSsm,
} from "../../../services/SecretService";
import { gunzipSync } from "node:zlib";

describe("SecretService compactJsonForStorage", () => {
  it("compacts pretty JSON content", () => {
    const prettyJson = JSON.stringify(
      {
        account_id: "acct_123",
        tokens: {
          access_token: "abc",
          refresh_token: "def",
        },
      },
      null,
      2,
    );

    const compacted = compactJsonForStorage(prettyJson);

    expect(compacted).toBe(
      '{"account_id":"acct_123","tokens":{"access_token":"abc","refresh_token":"def"}}',
    );
    expect(Buffer.byteLength(compacted, "utf-8")).toBeLessThan(
      Buffer.byteLength(prettyJson, "utf-8"),
    );
  });

  it("returns trimmed content when payload is not valid JSON", () => {
    expect(compactJsonForStorage("  not-json  ")).toBe("not-json");
  });

  it("compresses oversized auth payload for SSM storage", () => {
    const largeJson = JSON.stringify({
      tokens: Array.from({ length: 700 }, () => "token-value"),
    });

    const encoded = encodeCodexAuthForSsm(largeJson);

    expect(encoded.startsWith("gz+b64:")).toBe(true);

    const compressedPayload = encoded.slice("gz+b64:".length);
    const decoded = gunzipSync(Buffer.from(compressedPayload, "base64")).toString(
      "utf-8",
    );
    expect(decoded).toBe(largeJson);
    expect(Buffer.byteLength(encoded, "utf-8")).toBeLessThan(3900);
  });

  it("returns compacted payload directly when under SSM size limit", () => {
    const smallJson = JSON.stringify({ token: "abc" }, null, 2);
    expect(encodeCodexAuthForSsm(smallJson)).toBe('{"token":"abc"}');
  });
});
