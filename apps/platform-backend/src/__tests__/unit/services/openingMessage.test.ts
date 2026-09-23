import { PROMPT_TYPE } from "../../../persistence/promptTemplate/PromptTemplateDAO";
import { withOpeningMessage } from "../../../services/agentSession/openingMessage";

describe("withOpeningMessage", () => {
  it("appends the person's message to a fresh task, whose template has no slot for it", () => {
    expect(
      withOpeningMessage(PROMPT_TYPE.ticket_research, "Create a research document.", "  Focus on the checkout flow. "),
    ).toBe("Create a research document.\n\n<user-message>\nFocus on the checkout flow.\n</user-message>");
  });

  it("leaves revision tasks alone: their template already renders the message", () => {
    expect(
      withOpeningMessage(PROMPT_TYPE.ticket_planning_revision_task, "Revise the plan. Shorter, please.", "Shorter, please."),
    ).toBe("Revise the plan. Shorter, please.");
  });

  it("adds nothing for an empty message", () => {
    expect(withOpeningMessage(PROMPT_TYPE.ticket_developing, "Implement it.", "   ")).toBe("Implement it.");
  });
});
