import { outputsQueryOf } from "../../../../api/routes/outputs";

describe("outputsQueryOf", () => {
  it("keeps known filters and trims search", () => {
    expect(outputsQueryOf({ kind: "deck", producer: "agent", spaceId: "s-1", q: "  board ", latest: "true", cursor: "abc" })).toEqual({
      kind: "deck",
      producer: "agent",
      spaceId: "s-1",
      q: "board",
      latest: true,
      cursor: "abc",
    });
  });

  it("ignores values it doesn't know, and caps search", () => {
    const query = outputsQueryOf({ kind: "video", producer: "robot", q: "x".repeat(150), latest: "yes", spaceId: "  " });

    expect(query).toMatchObject({ kind: undefined, producer: undefined, spaceId: undefined, latest: false });
    expect(query.q).toHaveLength(100);
  });
});
