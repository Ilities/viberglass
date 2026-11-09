import { REDACTED, SecretRedactor } from "./SecretRedactor";

describe("SecretRedactor", () => {
  it("replaces every bound secret value wherever it appears", () => {
    const redactor = new SecretRedactor(["model-key-value-123", "scm-token-abcdef"]);

    expect(redactor.redact("ANTHROPIC_API_KEY=model-key-value-123\nVIBERGLASS_SCM_TOKEN=scm-token-abcdef")).toBe(
      `ANTHROPIC_API_KEY=${REDACTED}\nVIBERGLASS_SCM_TOKEN=${REDACTED}`,
    );
  });

  it("replaces the longest value first so a secret containing another leaves nothing behind", () => {
    const redactor = new SecretRedactor(["abcdefgh", "abcdefgh-ijklmnop"]);

    expect(redactor.redact("x abcdefgh-ijklmnop y")).toBe(`x ${REDACTED} y`);
  });

  it("leaves values too short to tell apart from ordinary text", () => {
    const redactor = new SecretRedactor(["true", "1234567", undefined, ""]);

    expect(redactor.redact("enabled=true pin=1234567")).toBe("enabled=true pin=1234567");
  });

  it("matches a secret's URL-encoded form", () => {
    const redactor = new SecretRedactor(["p@ss/word+1"]);

    expect(redactor.redact("https://bot:p%40ss%2Fword%2B1@git.example.com")).not.toContain("p%40ss");
  });

  it("matches the tokens inside a JSON secret such as a stored login", () => {
    const login = JSON.stringify({ tokens: { access_token: "access-token-value-xyz", refresh_token: "refresh-token-value-xyz" } });
    const redactor = new SecretRedactor([login]);

    const output = redactor.redact('{\n  "access_token": "access-token-value-xyz",\n  "refresh_token": "refresh-token-value-xyz"\n}');

    expect(output).not.toContain("access-token-value-xyz");
    expect(output).not.toContain("refresh-token-value-xyz");
  });

  it("takes credentials out of URLs even when they aren't bound to the run", () => {
    const redactor = new SecretRedactor([]);

    expect(redactor.redact("origin https://x-access-token:unbound-secret@github.com/acme/web.git (fetch)")).toBe(
      `origin https://x-access-token:${REDACTED}@github.com/acme/web.git (fetch)`,
    );
    expect(redactor.redact("https://abcdefghijklmnopqrstuvwxyz0123@gitlab.com/acme/web")).toBe(
      `https://${REDACTED}@gitlab.com/acme/web`,
    );
    expect(redactor.redact("http://localhost:8888/api and git@github.com:acme/web.git")).toBe(
      "http://localhost:8888/api and git@github.com:acme/web.git",
    );
  });

  it("keeps the well-known token patterns", () => {
    const redactor = new SecretRedactor([]);
    const github = `ghp_${"a".repeat(36)}`;

    const output = redactor.redact(`${github} sk-ant-api03-${"b".repeat(30)} Authorization: Bearer ${"c".repeat(24)}`);

    expect(output).not.toContain(github);
    expect(output).not.toContain("b".repeat(30));
    expect(output).not.toContain("c".repeat(24));
  });

  it("redacts every string in a nested value and leaves the rest as it was", () => {
    const redactor = new SecretRedactor(["model-key-value-123"]);
    const when = new Date(0);

    expect(
      redactor.redactValue({
        title: "env",
        count: 3,
        done: true,
        missing: null,
        when,
        content: [{ type: "text", text: "KEY=model-key-value-123" }],
      }),
    ).toEqual({
      title: "env",
      count: 3,
      done: true,
      missing: null,
      when,
      content: [{ type: "text", text: `KEY=${REDACTED}` }],
    });
  });
});
