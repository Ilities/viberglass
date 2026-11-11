import { vibeSessionUsage } from "../src/vibeSessionUsage";

const usageUpdate = (meta: Record<string, unknown>) => ({ sessionUpdate: "usage_update", used: 9000, size: 200000, _meta: meta });

describe("vibeSessionUsage", () => {
  it("reads the session's totals from a usage update's _meta", () => {
    const update = usageUpdate({ steps: 4, promptTokens: 52_000, completionTokens: 3_100, cachedTokens: 40_000, totalTokens: 55_100 });
    expect(vibeSessionUsage.totalsOf(update)).toEqual({ inputTokens: 52_000, outputTokens: 3_100, cachedReadTokens: 40_000 });
  });

  it("counts no cached tokens when the update leaves them out", () => {
    expect(vibeSessionUsage.totalsOf(usageUpdate({ promptTokens: 0, completionTokens: 0 }))).toEqual({ inputTokens: 0, outputTokens: 0, cachedReadTokens: 0 });
  });

  it("reads nothing from other updates or a usage update without totals", () => {
    expect(vibeSessionUsage.totalsOf({ sessionUpdate: "agent_message_chunk", _meta: { promptTokens: 5, completionTokens: 1 } })).toBeNull();
    expect(vibeSessionUsage.totalsOf({ sessionUpdate: "usage_update", used: 9000, size: 200000 })).toBeNull();
    expect(vibeSessionUsage.totalsOf(usageUpdate({ promptTokens: 5 }))).toBeNull();
  });
});
