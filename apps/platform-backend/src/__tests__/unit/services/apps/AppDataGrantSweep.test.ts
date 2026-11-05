import { AppDataGrantSweep } from "../../../../services/apps/AppDataGrantSweep";

const grant = (id: string) => ({ id, objectKey: `spaces/s/data-grants/${id}/app.db` });

describe("AppDataGrantSweep", () => {
  it("deletes the copies no turn needs, looking back a day for unused ones", async () => {
    const grants = { listDone: jest.fn().mockResolvedValue([grant("a"), grant("b")]), markRemoved: jest.fn() };
    const copier = { remove: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("storage down")) };
    const now = new Date("2026-11-05T12:00:00.000Z");

    const removed = await new AppDataGrantSweep(grants as never, copier).sweep(now);

    expect(grants.listDone).toHaveBeenCalledWith(new Date("2026-11-04T12:00:00.000Z"));
    expect(removed).toBe(1);
    // One that couldn't be deleted stays listed, so the next sweep tries again.
    expect(grants.markRemoved).toHaveBeenCalledTimes(1);
    expect(grants.markRemoved).toHaveBeenCalledWith("a");
  });
});
