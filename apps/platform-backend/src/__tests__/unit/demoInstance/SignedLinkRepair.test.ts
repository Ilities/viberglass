import { SignedLinkRepair, withoutSignedQueries } from "../../../demo/export/SignedLinkRepair";

const GLM = "https://glm-file.bigmodel.cn/ccproxy/file-input/badda8faf9cdc6fff084cb3e90608a99-54945";

describe("SignedLinkRepair", () => {
  it.each([
    ["Alibaba OSS", `${GLM}?OSSAccessKeyId=LTAIexample&Expires=1794504434&Signature=abc%2Bdef%3D`, GLM],
    ["S3", "https://bucket.s3.amazonaws.com/a/b.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F&X-Amz-Signature=ff00", "https://bucket.s3.amazonaws.com/a/b.png"],
    ["Google Cloud Storage", "https://storage.googleapis.com/b/o.png?GoogleAccessId=svc%40p.iam&Expires=1&Signature=xyz", "https://storage.googleapis.com/b/o.png"],
    ["Azure SAS", "https://acct.blob.core.windows.net/c/o.png?sv=2022-11-02&se=2026-01-01&sig=abc%3D", "https://acct.blob.core.windows.net/c/o.png"],
    ["HTML-escaped", "https://cdn.example/o.png?Expires=1&amp;Key-Pair-Id=K1&amp;Signature=s", "https://cdn.example/o.png"],
  ])("drops a %s link's query and keeps its path", (_kind, link, expected) => {
    expect(withoutSignedQueries(`See ${link} for the screenshot.`)).toBe(`See ${expected} for the screenshot.`);
  });

  it("stops at a quote, a backslash, a closing parenthesis or a fragment", () => {
    expect(withoutSignedQueries(`{"imageSource":"${GLM}?OSSAccessKeyId=k&Signature=s","prompt":"x"}`)).toBe(`{"imageSource":"${GLM}","prompt":"x"}`);
    expect(withoutSignedQueries(`{\\"imageSource\\":\\"${GLM}?OSSAccessKeyId=k&Signature=s\\"}`)).toBe(`{\\"imageSource\\":\\"${GLM}\\"}`);
    expect(withoutSignedQueries(`[shot](${GLM}?sig=s)`)).toBe(`[shot](${GLM})`);
    expect(withoutSignedQueries(`${GLM}?sig=s#top`)).toBe(`${GLM}#top`);
  });

  it("leaves unsigned links alone", () => {
    const text = "https://github.com/acme/app/pulls?q=is%3Aopen&page=2 and https://example.com/search?signature_style=bold";
    expect(withoutSignedQueries(text)).toBe(text);
  });

  it("repairs strings at any depth in any table and keeps untouched rows as they were", () => {
    const untouched = { id: "e1", payload_json: { text: "No links here" } };
    const [event, same] = new SignedLinkRepair().repair("agent_session_events", [
      { id: "e2", created_at: new Date(0), payload_json: { content: [{ type: "text", text: `${GLM}?OSSAccessKeyId=k&Signature=s` }] } },
      untouched,
    ]);

    expect(event).toEqual({ id: "e2", created_at: new Date(0), payload_json: { content: [{ type: "text", text: GLM }] } });
    expect(same).toBe(untouched);
  });
});
