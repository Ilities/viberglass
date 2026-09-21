import { hashConfig, hashPrompt, REDACTED, redactSecrets } from "./manifest";

describe("hashConfig", () => {
  it("is insensitive to key order", () => {
    expect(hashConfig({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashConfig({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("is sensitive to values", () => {
    expect(hashConfig({ maxChanges: 5 })).not.toBe(hashConfig({ maxChanges: 6 }));
  });

  it("stays sensitive to array order", () => {
    expect(hashConfig(["a", "b"])).not.toBe(hashConfig(["b", "a"]));
  });

  it("ignores explicitly-undefined properties", () => {
    expect(hashConfig({ a: 1, b: undefined })).toBe(hashConfig({ a: 1 }));
  });
});

describe("hashPrompt", () => {
  it("is stable and distinguishes prompts", () => {
    expect(hashPrompt("fix the bug")).toBe(hashPrompt("fix the bug"));
    expect(hashPrompt("fix the bug")).not.toBe(hashPrompt("fix the  bug"));
  });
});

describe("redactSecrets", () => {
  const token = "ghp_0123456789abcdef";

  it("redacts a secret nested in an object", () => {
    const result = redactSecrets(
      { scm: { url: `https://${token}@github.com/acme/repo` } },
      [token],
    );
    expect(result.scm.url).toBe(`https://${REDACTED}@github.com/acme/repo`);
  });

  it("redacts every occurrence", () => {
    const result = redactSecrets([token, `prefix ${token} suffix`], [token]);
    expect(result).toEqual([REDACTED, `prefix ${REDACTED} suffix`]);
  });

  it("leaves the structure untouched when there are no secrets", () => {
    const input = { a: "value", b: [1, 2] };
    expect(redactSecrets(input, [])).toEqual(input);
  });

  it("ignores short secrets that would redact ordinary text", () => {
    expect(redactSecrets({ task: "fix the bug" }, ["bug"])).toEqual({
      task: "fix the bug",
    });
  });

  it("preserves non-string leaves", () => {
    expect(redactSecrets({ n: 1, b: true, z: null }, [token])).toEqual({
      n: 1,
      b: true,
      z: null,
    });
  });
});
