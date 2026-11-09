import { gzipSync } from "zlib";
import { SecretScanner } from "../../../demo/export/SecretScanner";

describe("SecretScanner", () => {
  const scanner = new SecretScanner([
    { kind: "a real email address", value: "jussi@example.com" },
    { kind: "callback token", value: "cbtoken-0123456789" },
    { kind: "too short to check", value: "abc" },
  ]);

  it.each([
    ["API key (sk-)", "export ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz"],
    ["GitHub token", "token ghp_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["credentials in a URL", "cloning https://x-access-token:abc123@github.com/acme/app.git"],
    ["AWS access key", "AKIAIOSFODNN7EXAMPLE"],
    ["signed storage link", "https://minio/bucket/key?X-Amz-Credential=abc&X-Amz-Signature=def"],
    ["Z.ai API key", "key 0123456789abcdef0123456789abcdef.AbCdEfGhIjKlMnOp"],
    ["private key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
  ])("finds a %s", (kind, text) => {
    expect(scanner.scanText(text, "here").map((finding) => finding.kind)).toContain(kind);
  });

  it("finds values the source keeps secret, whatever their case, but never prints them whole", () => {
    const findings = scanner.scanValue({ body: "Ping JUSSI@example.com", nested: ["cbtoken-0123456789"] }, "task_messages m1");
    expect(findings.map((finding) => finding.kind)).toEqual(["a real email address", "callback token"]);
    expect(findings.every((finding) => finding.excerpt.endsWith("chars)"))).toBe(true);
  });

  it("leaves ordinary prose about passwords and tokens alone", () => {
    expect(scanner.scanText("A customer can't reset their password on mobile; the run used 48000 tokens.", "here")).toEqual([]);
  });

  it("looks inside gzipped objects", () => {
    expect(scanner.scanObject(gzipSync(Buffer.from("const key = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'")), "object a.tar.gz")).toHaveLength(1);
  });

  it("skips findings someone has checked", () => {
    const allowing = new SecretScanner([], ["AKIAIOSFODNN7EXAMPLE"]);
    expect(allowing.scanText("The docs' sample key AKIAIOSFODNN7EXAMPLE", "here")).toEqual([]);
  });
});
