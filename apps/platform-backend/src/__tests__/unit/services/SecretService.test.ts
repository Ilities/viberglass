import { compactJsonForStorage } from "../../../services/SecretService";

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
});
