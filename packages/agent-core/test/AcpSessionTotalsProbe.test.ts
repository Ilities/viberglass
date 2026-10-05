import { AcpSessionTotalsProbe } from "../src/acp/AcpSessionTotalsProbe";

const chunk = (text: string) => ({ sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });

describe("AcpSessionTotalsProbe", () => {
  it("takes the harness's answer while it runs, and lets updates through otherwise", () => {
    const parse = jest.fn((text: string) => ({ inputTokens: text.length }));
    const probe = new AcpSessionTotalsProbe({ command: "/session", parse });

    expect(probe.capture(chunk("before"))).toBe(false);
    probe.begin();
    expect(probe.capture(chunk("Tokens: "))).toBe(true);
    expect(probe.capture(chunk("in 5"))).toBe(true);
    expect(probe.end()).toEqual({ inputTokens: 12 });
    expect(parse).toHaveBeenCalledWith("Tokens: in 5");
    expect(probe.capture(chunk("after"))).toBe(false);
  });

  it("reads nothing when the harness didn't answer", () => {
    const probe = new AcpSessionTotalsProbe({ command: "/session", parse: () => ({ inputTokens: 1 }) });
    probe.begin();
    expect(probe.end()).toBeNull();
  });
});
