import { serializeEventPayload } from "../../../../persistence/agentSession/AgentSessionEventDAO";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

describe("serializeEventPayload", () => {
  it("drops NUL characters from strings at any depth", () => {
    const payload = { text: "a\u0000b", output: [{ content: "\u0000bin\u0000" }] };
    expect(JSON.parse(serializeEventPayload(payload))).toEqual({ text: "ab", output: [{ content: "bin" }] });
  });

  it("keeps a literal backslash-u0000 sequence", () => {
    expect(JSON.parse(serializeEventPayload({ text: "\\u0000" }))).toEqual({ text: "\\u0000" });
  });
});
