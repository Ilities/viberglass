import { intentOf, TaskTurnOutcomeService } from "../../../../services/taskTurns/TaskTurnOutcomeService";

const SESSION = { ticketId: "t-1" };
const TURN = { id: "turn-1", action: "plan" as const };

function setup(streamed: string[] = ["Writing the plan: checking the theme store.", "\n\nDone."]) {
  const deps = {
    turns: { update: jest.fn() },
    events: { listAssistantTextByTurn: jest.fn().mockResolvedValue(streamed) },
    documents: { saveDocument: jest.fn() },
    workerEvents: { batchIngest: jest.fn() },
    mentions: { createForTurn: jest.fn() },
    summaries: { create: jest.fn() },
    participants: {
      list: jest.fn().mockResolvedValue([
        { userId: "owner", name: "Olli Owner", email: "o@x", role: "owner", addedAt: "" },
        { userId: "tomi", name: "Tomi Laine", email: "t@x", role: "reviewer", addedAt: "" },
      ]),
    },
  };
  return { deps, service: new TaskTurnOutcomeService(deps) };
}

describe("TaskTurnOutcomeService", () => {
  it("saves the plan a reply rewrote as a new version, and records the reply", async () => {
    const { deps, service } = setup();

    const recorded = await service.record("job-1", SESSION, { id: "turn-1", action: "reply" }, {
      success: true,
      documents: { plan: "# Plan" },
      resumed: true,
      commitHash: "abc",
    });

    expect(deps.documents.saveDocument).toHaveBeenCalledTimes(1);
    expect(deps.documents.saveDocument).toHaveBeenCalledWith("t-1", "planning", "# Plan", { source: "agent", agentTurnId: "turn-1" });
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", {
      contentMarkdown: "Writing the plan: checking the theme store.\n\nDone.",
      contentJson: {
        intent: "Writing the plan: checking the theme store.",
        reply: "Writing the plan: checking the theme store.\n\nDone.",
        produced: ["plan", "code"],
        codeDiscarded: false,
        resumed: true,
        mentioned: [{ id: "tomi", name: "Tomi Laine" }],
        contextUsage: null,
        compacted: false,
        commit: "abc",
      },
    });
    // The run's Activity names what it produced last, and whom the agent mentioned.
    expect(recorded).toEqual({ step: "execution", mentioned: ["tomi"] });
    expect(deps.mentions.createForTurn).toHaveBeenCalledWith("t-1", "turn-1", ["tomi"]);
    // Ended after the documents are saved, so a queued turn reads them.
    expect(deps.workerEvents.batchIngest).toHaveBeenCalledWith("job-1", [
      { eventType: "turn_completed", payload: { produced: ["plan", "code"] } },
    ]);
    expect(deps.documents.saveDocument.mock.invocationCallOrder[0]).toBeLessThan(deps.workerEvents.batchIngest.mock.invocationCallOrder[0]);
  });

  it("records a turn that only answered, and one whose code was thrown away", async () => {
    const { deps, service } = setup(["Answering: it's per device."]);

    const recorded = await service.record("job-1", SESSION, TURN, { success: true, documents: { plan: "  " }, codeDiscarded: true });

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", {
      contentMarkdown: "Answering: it's per device.",
      contentJson: expect.objectContaining({ produced: [], codeDiscarded: true, resumed: null, mentioned: [] }),
    });
    expect(recorded).toBeNull();
    expect(deps.participants.list).not.toHaveBeenCalled();
  });

  it("saves the summary a summarise turn wrote as the next version, and mentions nobody for it", async () => {
    const { deps, service } = setup(["Summarising: the decisions so far."]);

    const recorded = await service.record("job-1", SESSION, { id: "turn-2", action: "summarise" }, {
      success: true,
      documents: { summary: "# Summary\n\n- Ship on Friday (Maria agreed)" },
      contextUsage: { used: 90_000, size: 200_000 },
      compacted: true,
    });

    expect(deps.summaries.create).toHaveBeenCalledWith("t-1", "# Summary\n\n- Ship on Friday (Maria agreed)", "turn-2");
    expect(deps.turns.update).toHaveBeenCalledWith("turn-2", {
      contentMarkdown: "Summarising: the decisions so far.",
      contentJson: expect.objectContaining({ produced: ["summary"], mentioned: [], contextUsage: { used: 90_000, size: 200_000 }, compacted: true }),
    });
    expect(recorded).toBeNull();
  });

  it("ignores SUMMARY.md written by a turn that wasn't asked for a summary", async () => {
    const { deps, service } = setup();
    await service.record("job-1", SESSION, TURN, { success: true, documents: { summary: "# Notes" } });
    expect(deps.summaries.create).not.toHaveBeenCalled();
  });

  it("mentions the owner when the task has no reviewers", async () => {
    const { deps, service } = setup();
    deps.participants.list.mockResolvedValue([{ userId: "owner", name: "Olli Owner", email: "o@x", role: "owner", addedAt: "" }]);

    await expect(service.record("job-1", SESSION, { id: "turn-1", action: "plan" }, { success: true, documents: { plan: "# Plan" } })).resolves.toEqual({
      step: "planning",
      mentioned: ["owner"],
    });
  });

  it("ends a turn that missed the document it was asked for as failed, keeping its code", async () => {
    const { deps, service } = setup(["Writing the plan."]);

    await service.record("job-1", SESSION, TURN, { success: true, documents: { summary: "# Notes" }, commitHash: "abc", missing: "plan" });

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
    expect(deps.workerEvents.batchIngest).toHaveBeenCalledWith("job-1", [{ eventType: "turn_failed", payload: { produced: ["code"] } }]);
  });

  it("saves the plan a plan turn wrote and mentions the reviewers", async () => {
    const { deps, service } = setup();

    const recorded = await service.record("job-1", SESSION, TURN, { success: true, documents: { plan: "# Plan" } });

    expect(deps.documents.saveDocument).toHaveBeenCalledTimes(1);
    expect(deps.documents.saveDocument).toHaveBeenCalledWith("t-1", "planning", "# Plan", { source: "agent", agentTurnId: "turn-1" });
    expect(recorded).toEqual({ step: "planning", mentioned: ["tomi"] });
  });

  it("keeps no document from a build turn", async () => {
    const { deps, service } = setup();

    await service.record("job-1", SESSION, { id: "turn-1", action: "code" }, { success: true, documents: { plan: "# Plan" }, commitHash: "abc" });

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
  });

  it("keeps nothing from a failed turn but what it said", async () => {
    const { deps, service } = setup([]);

    await service.record("job-1", SESSION, TURN, { success: false, documents: { plan: "# Half a plan" } });

    expect(deps.documents.saveDocument).not.toHaveBeenCalled();
    expect(deps.turns.update).toHaveBeenCalledWith("turn-1", { contentMarkdown: "", contentJson: expect.objectContaining({ intent: null, produced: [] }) });
    expect(deps.workerEvents.batchIngest).toHaveBeenCalledWith("job-1", [{ eventType: "turn_failed", payload: { produced: [] } }]);
  });
});

describe("intentOf", () => {
  it("is the first line the agent wrote, without markdown", () => {
    expect(intentOf("\n\n## **Revising the plan:** adding the `packing slip`\nmore")).toBe("Revising the plan: adding the packing slip");
    expect(intentOf("- Writing the plan")).toBe("Writing the plan");
    expect(intentOf("   ")).toBeNull();
    expect(intentOf("x".repeat(300))).toHaveLength(200);
  });

  it("stops at the end of the first sentence, so it never cuts off mid-thought", () => {
    expect(
      intentOf("Writing the plan: I'll read the repo's instructions first. greeting lives in greeting.js:1 — export const greeting = () => 'hello'"),
    ).toBe("Writing the plan: I'll read the repo's instructions first.");
    // A full stop inside a file name isn't the end of a sentence.
    expect(intentOf("Checking greeting.js before I change it")).toBe("Checking greeting.js before I change it");
  });
});
