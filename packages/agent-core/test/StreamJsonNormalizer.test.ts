import { StreamJsonNormalizer } from "../src/StreamJsonNormalizer";

const normalize = (line: unknown) => new StreamJsonNormalizer().processLine(typeof line === "string" ? line : JSON.stringify(line)).map((out) => JSON.parse(out));

describe("StreamJsonNormalizer", () => {
  it("turns an assistant turn into messages, reasoning and started commands", () => {
    expect(
      normalize({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Looking" },
            { type: "thinking", thinking: "hmm" },
            { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
          ],
        },
      }),
    ).toEqual([
      { type: "item.completed", item: { type: "agent_message", text: "Looking" } },
      { type: "item.completed", item: { type: "reasoning", text: "hmm" } },
      { type: "item.started", item: { type: "command_execution", command: "ls", id: "t1" } },
    ]);
  });

  it("completes a command from its tool result", () => {
    expect(normalize({ type: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "a.txt", is_error: true }] })).toEqual([
      { type: "item.completed", item: { type: "command_execution", output: "a.txt", status: "failed", exit_code: 1, id: "t1" } },
    ]);
  });

  it("drops system events and passes other lines through", () => {
    const codex = JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "ls" } });
    const normalizer = new StreamJsonNormalizer();
    expect(normalizer.processLine(JSON.stringify({ type: "system" }))).toEqual([]);
    expect(normalizer.processLine(codex)).toEqual([codex]);
    expect(normalizer.processLine("plain text")).toEqual(["plain text"]);
  });
});
