import { PreviewOpenings } from "../../../../services/apps/PreviewOpenings";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

describe("PreviewOpenings", () => {
  it("writes when a preview was opened at most once a minute", () => {
    let now = 0;
    const previews = { touch: jest.fn(async () => undefined) };
    const openings = new PreviewOpenings(previews, () => now);

    openings.opened("pv-1");
    openings.opened("pv-1");
    openings.opened("pv-2");
    now = 60_000;
    openings.opened("pv-1");

    expect(previews.touch.mock.calls).toEqual([
      ["pv-1", new Date(0)],
      ["pv-2", new Date(0)],
      ["pv-1", new Date(60_000)],
    ]);
  });
});
