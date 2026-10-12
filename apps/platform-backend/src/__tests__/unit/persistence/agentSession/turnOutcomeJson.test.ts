import { outcomeOf } from "../../../../persistence/agentSession/turnOutcomeJson";

describe("outcomeOf", () => {
  it("keeps what a Files turn saved", () => {
    const files = { id: "snap-2", parentId: "snap-1", fileCount: 3, totalBytes: 120, partial: true, changes: { added: 1, changed: 2, removed: 0 }, createdAt: "2026-10-12T10:00:00.000Z" };
    expect(outcomeOf({ reply: "Done.", produced: [], files })?.files).toEqual(files);
  });

  it("leaves files out for a turn that saved none", () => {
    expect(outcomeOf({ reply: "Done.", produced: ["plan"] })).not.toHaveProperty("files");
  });
});
