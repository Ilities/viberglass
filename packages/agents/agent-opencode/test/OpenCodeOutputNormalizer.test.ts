import { OpenCodeOutputNormalizer } from "../src/OpenCodeOutputNormalizer";

const normalize = (event: unknown) => new OpenCodeOutputNormalizer().processLine(JSON.stringify(event)).map((out) => JSON.parse(out));

describe("OpenCodeOutputNormalizer", () => {
  it("turns a text part into an agent message and drops step events", () => {
    expect(normalize({ type: "text", part: { text: " Done " } })).toEqual([{ type: "item.completed", item: { type: "agent_message", text: "Done" } }]);
    expect(normalize({ type: "step_finish", part: {} })).toEqual([]);
  });

  it("starts and completes a finished tool call, named by what it worked on", () => {
    expect(
      normalize({ type: "tool_use", part: { tool: "read", callID: "c1", state: { status: "completed", input: { filePath: "a.ts" }, output: "x" } } }),
    ).toEqual([
      { type: "item.started", item: { type: "command_execution", command: "read a.ts", id: "c1" } },
      { type: "item.completed", item: { type: "command_execution", command: "read a.ts", id: "c1", aggregated_output: "x", status: "completed", exit_code: 0 } },
    ]);
  });

  it("reads the serve event stream", () => {
    expect(normalize({ type: "message.part.updated", part: { type: "tool", id: "p1", state: "error", output: "boom" } })).toEqual([
      { type: "item.completed", item: { type: "command_execution", output: "boom", status: "failed", exit_code: 1, id: "p1" } },
    ]);
  });

  it("passes other lines through", () => {
    expect(new OpenCodeOutputNormalizer().processLine("plain")).toEqual(["plain"]);
  });
});
