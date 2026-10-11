import { ToolCallStartFilter } from "../src/acp/ToolCallStartFilter";

const start = (toolCallId: string, input: Record<string, unknown>) => ({ eventType: "tool_call_started", payload: { toolCallId, toolName: "bash", input } });

describe("ToolCallStartFilter", () => {
  it("drops a running call reported again with nothing new, and keeps one that changed", () => {
    const filter = new ToolCallStartFilter();
    expect(filter.keep(start("c1", {}))).toBe(true);
    expect(filter.keep(start("c1", { command: "ls" }))).toBe(true);
    expect(filter.keep(start("c1", { command: "ls" }))).toBe(false);
    expect(filter.keep(start("c2", { command: "ls" }))).toBe(true);
  });

  it("keeps everything else, and forgets a call once it finishes", () => {
    const filter = new ToolCallStartFilter();
    expect(filter.keep({ eventType: "assistant_message", payload: { text: "hi" } })).toBe(true);
    expect(filter.keep(start("c1", { command: "ls" }))).toBe(true);
    expect(filter.keep({ eventType: "tool_call_completed", payload: { toolCallId: "c1" } })).toBe(true);
    expect(filter.keep(start("c1", { command: "ls" }))).toBe(true);
  });
});
