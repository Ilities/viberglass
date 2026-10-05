import { defaultAcpEventMapper } from "../src/acp/acpEventMapper";

function update(fields: Record<string, unknown>) {
  return defaultAcpEventMapper.mapSessionUpdate({ sessionId: "s", update: fields });
}

describe("defaultAcpEventMapper tool calls", () => {
  it("reports a call again once the harness has its input, with what it works on", () => {
    // OpenCode announces a call before it has parsed the input.
    expect(update({ sessionUpdate: "tool_call", toolCallId: "c1", title: "read", kind: "read", status: "pending", rawInput: {} })).toEqual([
      { eventType: "tool_call_started", payload: { toolName: "read", toolCallId: "c1", kind: "read", input: {}, locations: [] } },
    ]);
    expect(
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "c1",
        status: "in_progress",
        kind: "read",
        title: "src/App.jsx",
        locations: [{ path: "/repo/src/App.jsx" }],
        rawInput: { filePath: "/repo/src/App.jsx" },
      }),
    ).toEqual([
      {
        eventType: "tool_call_started",
        payload: { toolName: "src/App.jsx", toolCallId: "c1", kind: "read", input: { filePath: "/repo/src/App.jsx" }, locations: ["/repo/src/App.jsx"] },
      },
    ]);
  });

  it("reads the output from OpenCode's rawOutput object, and cuts a long one short", () => {
    const [done] = update({ sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed", title: "src/App.jsx", rawOutput: { output: "export default App", metadata: {} } });
    expect(done).toEqual({ eventType: "tool_call_completed", payload: { toolName: "src/App.jsx", toolCallId: "c1", output: "export default App", success: true } });

    const [long] = update({ sessionUpdate: "tool_call_update", toolCallId: "c2", status: "completed", rawOutput: "x".repeat(10_000) });
    expect(String(long.payload.output)).toHaveLength(4001);
  });

  it("keeps a string output, and the error of a failed call", () => {
    expect(update({ sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed", rawOutput: "ok" })[0].payload.output).toBe("ok");
    expect(update({ sessionUpdate: "tool_call_update", toolCallId: "c1", status: "failed", rawOutput: { error: "No such file" } })).toEqual([
      { eventType: "tool_call_completed", payload: { toolName: "", toolCallId: "c1", error: "No such file", success: false } },
    ]);
  });
});
