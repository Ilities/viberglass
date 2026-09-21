import { parseClaudeCodeStreamJsonUsage } from "../src/usage";

const resultEvent = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 42_000,
    num_turns: 3,
    total_cost_usd: 0.1234,
    usage: {
      input_tokens: 120,
      output_tokens: 340,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 800,
    },
    ...overrides,
  });

const stream = (...lines: string[]) => lines.join("\n");

describe("parseClaudeCodeStreamJsonUsage", () => {
  it("extracts usage and cost from the result event", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      stream(
        JSON.stringify({ type: "system", subtype: "init" }),
        JSON.stringify({ type: "assistant", message: { content: [] } }),
        resultEvent(),
      ),
    );

    expect(usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 340,
      cacheReadInputTokens: 5000,
      cacheCreationInputTokens: 800,
      costUsd: 0.1234,
      turns: 3,
      stopReason: "success",
    });
  });

  it("returns undefined when the stream has no result event", () => {
    // A crashed or truncated run must report no usage rather than partial
    // usage that would look like a complete measurement.
    expect(
      parseClaudeCodeStreamJsonUsage(
        stream(
          JSON.stringify({ type: "system", subtype: "init" }),
          JSON.stringify({ type: "assistant", message: { content: [] } }),
        ),
      ),
    ).toBeUndefined();
  });

  it("returns undefined for empty output", () => {
    expect(parseClaudeCodeStreamJsonUsage("")).toBeUndefined();
  });

  it("ignores non-JSON interleaved on stdout", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      stream("warning: something happened", resultEvent(), "done"),
    );
    expect(usage?.inputTokens).toBe(120);
  });

  it("survives a truncated JSON line", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      stream('{"type":"assistant","message":{"cont', resultEvent()),
    );
    expect(usage?.outputTokens).toBe(340);
  });

  it("takes the last result event when a session is resumed", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      stream(
        resultEvent({ total_cost_usd: 0.01, usage: { output_tokens: 1 } }),
        resultEvent({ total_cost_usd: 0.99, usage: { output_tokens: 999 } }),
      ),
    );
    expect(usage).toMatchObject({ costUsd: 0.99, outputTokens: 999 });
  });

  it("reports the model that produced the most output tokens", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      resultEvent({
        modelUsage: {
          "claude-haiku-4-5": { outputTokens: 12 },
          "claude-opus-5": { outputTokens: 4000 },
        },
      }),
    );
    expect(usage?.model).toBe("claude-opus-5");
  });

  it("prefers an explicit model field over modelUsage", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      resultEvent({
        model: "claude-opus-5",
        modelUsage: { "claude-haiku-4-5": { outputTokens: 9000 } },
      }),
    );
    expect(usage?.model).toBe("claude-opus-5");
  });

  it("omits fields the CLI did not report rather than defaulting them to zero", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      JSON.stringify({ type: "result", usage: { input_tokens: 5 } }),
    );
    expect(usage?.inputTokens).toBe(5);
    expect(usage?.outputTokens).toBeUndefined();
    expect(usage?.costUsd).toBeUndefined();
  });

  it("rejects non-numeric usage values", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      JSON.stringify({
        type: "result",
        subtype: "success",
        usage: { input_tokens: "lots", output_tokens: 7 },
      }),
    );
    expect(usage?.inputTokens).toBeUndefined();
    expect(usage?.outputTokens).toBe(7);
  });

  it("handles CRLF line endings", () => {
    const usage = parseClaudeCodeStreamJsonUsage(
      ['{"type":"system"}', resultEvent()].join("\r\n"),
    );
    expect(usage?.inputTokens).toBe(120);
  });
});
