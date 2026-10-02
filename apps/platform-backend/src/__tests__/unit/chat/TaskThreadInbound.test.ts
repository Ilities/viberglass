import { LINK_SLACK_ACCOUNT, TaskThreadInbound } from "../../../chat/TaskThreadInbound";

const MARIA = "11111111-1111-4111-8111-111111111111";

function setup(open: Array<{ id: string; askedOf: { id: string; name: string } | null }> = []) {
  const deps = {
    users: {
      findActiveIdBySlackUserId: jest.fn(async (slackUserId: string) => ({ UMARIA: MARIA, UTOMI: "u-tomi" })[slackUserId] ?? null),
      getContact: jest.fn(async (userId: string) => (userId === MARIA ? { name: "Maria", email: "m@example.com", slackUserId: "UMARIA", deactivated: false } : null)),
    },
    questions: {
      listOpenForTasks: jest.fn().mockResolvedValue(new Map([["t-1", open]])),
      getById: jest.fn().mockResolvedValue({ id: "q-1", ticketId: "t-1", options: ["North", "South"] }),
    },
    answers: { answer: jest.fn().mockResolvedValue(undefined) },
    turns: { ask: jest.fn().mockResolvedValue(undefined) },
    discussion: { create: jest.fn().mockResolvedValue("m-1") },
  };
  return { deps, inbound: new TaskThreadInbound(deps) };
}

describe("TaskThreadInbound", () => {
  it("posts a plain reply in the task's thread, with Slack mentions of linked people as mentions", async () => {
    const { deps, inbound } = setup();
    await inbound.receive({ ticketId: "t-1", slackUserId: "UTOMI", text: "<@UMARIA|maria> can you check?  <@UNOBODY>", mentionsBot: false });
    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "u-tomi", `@[Maria](user:${MARIA}) can you check?`);
    expect(deps.turns.ask).not.toHaveBeenCalled();
  });

  it("asks the agent when the message mentions the bot", async () => {
    const { deps, inbound } = setup();
    await inbound.receive({ ticketId: "t-1", slackUserId: "UTOMI", text: "<@UBOT> cover Safari too", mentionsBot: true });
    expect(deps.turns.ask).toHaveBeenCalledWith("t-1", "u-tomi", { message: "cover Safari too" });
  });

  it("answers the agent's question when the person it asked replies", async () => {
    const { deps, inbound } = setup([{ id: "q-1", askedOf: { id: MARIA, name: "Maria" } }]);
    await inbound.receive({ ticketId: "t-1", slackUserId: "UMARIA", text: "North, please", mentionsBot: false });
    expect(deps.answers.answer).toHaveBeenCalledWith("t-1", "q-1", MARIA, "North, please");
    expect(deps.discussion.create).not.toHaveBeenCalled();

    // Someone else's reply is a message, not their answer.
    await inbound.receive({ ticketId: "t-1", slackUserId: "UTOMI", text: "I'd say South", mentionsBot: false });
    expect(deps.discussion.create).toHaveBeenCalledWith("t-1", "u-tomi", "I'd say South");
  });

  it("answers with the option a button stands for", async () => {
    const { deps, inbound } = setup();
    await inbound.answer({ questionId: "q-1", option: 1, slackUserId: "UTOMI" });
    expect(deps.answers.answer).toHaveBeenCalledWith("t-1", "q-1", "u-tomi", "South");
    await expect(inbound.answer({ questionId: "q-1", option: 7, slackUserId: "UTOMI" })).rejects.toThrow("isn't there any more");
  });

  it("asks people without a linked account to link it before they write, but lets a button start a step", async () => {
    const { deps, inbound } = setup();
    await expect(inbound.receive({ ticketId: "t-1", slackUserId: "USTRANGER", text: "hi", mentionsBot: false })).rejects.toThrow(LINK_SLACK_ACCOUNT);
    await inbound.ask({ ticketId: "t-1", slackUserId: "USTRANGER", action: "plan" });
    expect(deps.turns.ask).toHaveBeenCalledWith("t-1", null, { message: "", action: "plan", agentId: undefined });
  });
});
