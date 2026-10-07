import { assistantMessages } from "../../../../persistence/agentSession/AgentSessionEventDAO";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const said = (text: string) => ({ event_type: "assistant_message", payload_json: { text } });
const tool = { event_type: "tool_call_started", payload_json: { toolName: "read" } };

describe("assistantMessages", () => {
  it("joins the chunks of one message and starts a new one after anything else", () => {
    expect(assistantMessages([said("I'll read the "), said("codebase."), tool, said("I've read "), said("it.")])).toEqual([
      "I'll read the codebase.",
      "I've read it.",
    ]);
  });

  it("skips chunks without text", () => {
    expect(assistantMessages([said("First."), { event_type: "assistant_message", payload_json: {} }, said(" Second.")])).toEqual([
      "First. Second.",
    ]);
  });
});
