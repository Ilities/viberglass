import { MistralOutputNormalizer } from "../src/MistralOutputNormalizer";

const lines = (value: unknown) => JSON.stringify(value, null, 2).split("\n");

describe("MistralOutputNormalizer", () => {
  it("reads a pretty-printed assistant message once it closes", () => {
    const normalizer = new MistralOutputNormalizer();
    const message = lines({
      role: "assistant",
      content: "On it",
      tool_calls: [{ id: "c1", function: { name: "grep", arguments: '{"pattern":"TODO"}' } }],
    });
    const outputs = message.flatMap((line) => normalizer.processLine(line));

    expect(outputs.map((out) => JSON.parse(out))).toEqual([
      { type: "item.completed", item: { type: "agent_message", text: "On it" } },
      { type: "item.started", item: { type: "command_execution", command: "grep pattern=TODO", id: "c1" } },
    ]);
  });

  it("completes a command from a tool message", () => {
    const normalizer = new MistralOutputNormalizer();
    const outputs = lines({ role: "tool", tool_call_id: "c1", content: "a.ts" }).flatMap((line) => normalizer.processLine(line));

    expect(outputs.map((out) => JSON.parse(out))).toEqual([
      { type: "item.completed", item: { type: "command_execution", output: "a.ts", status: "completed", exit_code: 0, id: "c1" } },
    ]);
  });

  it("drops a message cut short when the command exits", () => {
    const normalizer = new MistralOutputNormalizer();
    lines({ role: "assistant", content: "On it" }).slice(0, -1).forEach((line) => normalizer.processLine(line));

    expect(normalizer.flush()).toEqual([]);
  });

  it("reads a one-line object as stream-json and passes text through", () => {
    const normalizer = new MistralOutputNormalizer();
    expect(normalizer.processLine(JSON.stringify({ type: "system" }))).toEqual([]);
    expect(normalizer.processLine("plain")).toEqual(["plain"]);
  });
});
