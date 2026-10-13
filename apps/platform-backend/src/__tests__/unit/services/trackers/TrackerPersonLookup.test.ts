import { TrackerPersonLookup } from "../../../../services/trackers/TrackerPersonLookup";

const BY_ID = { name: "A member", email: null, accountId: "member-1" };

describe("TrackerPersonLookup", () => {
  it("asks the connection's tracker for a person the event names only by id", async () => {
    const findPerson = jest.fn().mockResolvedValue({ name: "Maria", email: "maria@example.com", accountId: "member-1" });
    const commenters = { resolve: jest.fn().mockResolvedValue({ postComment: jest.fn(), findPerson }) };

    await expect(new TrackerPersonLookup(commenters).complete("conn-1", BY_ID)).resolves.toEqual({ name: "Maria", email: "maria@example.com", accountId: "member-1" });
    expect(commenters.resolve).toHaveBeenCalledWith({ integrationId: "conn-1" });
    expect(findPerson).toHaveBeenCalledWith("member-1");
  });

  it("doesn't look up a person the event already names with an email, or without an id", async () => {
    const commenters = { resolve: jest.fn() };
    const lookup = new TrackerPersonLookup(commenters);

    await lookup.complete("conn-1", { name: "Maria", email: "maria@example.com", accountId: "member-1" });
    await lookup.complete("conn-1", { name: "Pat", email: null });
    expect(commenters.resolve).not.toHaveBeenCalled();
  });

  it("keeps the event's person when the tracker can't look people up, doesn't find them, or fails", async () => {
    const lookupWith = (commenter: unknown) => new TrackerPersonLookup({ resolve: jest.fn().mockResolvedValue(commenter) }).complete("conn-1", BY_ID);

    await expect(lookupWith(null)).resolves.toEqual(BY_ID);
    await expect(lookupWith({ postComment: jest.fn() })).resolves.toEqual(BY_ID);
    await expect(lookupWith({ postComment: jest.fn(), findPerson: jest.fn().mockResolvedValue(null) })).resolves.toEqual(BY_ID);
    await expect(lookupWith({ postComment: jest.fn(), findPerson: jest.fn().mockRejectedValue(new Error("401")) })).resolves.toEqual(BY_ID);
  });
});
