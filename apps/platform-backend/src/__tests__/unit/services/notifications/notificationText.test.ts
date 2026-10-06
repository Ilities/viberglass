import { notificationText } from "@viberglass/types";

describe("notificationText for failed runs", () => {
  it("doesn't blame setup for a platform failure, and keeps the reason the task page shows", () => {
    expect(notificationText("run_failed_setup", null, "Rewrite the email", { step: "planning", reason: "Agent stopped responding" })).toBe(
      "A plan run on “Rewrite the email” failed and needs an admin: Agent stopped responding",
    );
  });

  it("tells the owner the reason of an agent failure", () => {
    expect(notificationText("run_failed_agent", null, "Fix rounding", { step: "planning", reason: "Agent failed" })).toBe(
      "The plan run on “Fix rounding” failed: Agent failed",
    );
  });
});

describe("notificationText for mentions", () => {
  it("says what the agent has ready when it mentions someone", () => {
    expect(notificationText("mentioned", null, "Gift notes", { step: "planning" })).toBe("The agent mentioned you on “Gift notes”: the plan is ready");
  });

  it("names the person who mentioned someone in the thread", () => {
    expect(notificationText("mentioned", "Tomi", "Gift notes", {})).toBe("Tomi mentioned you on “Gift notes”");
  });
});

describe("notificationText for a merge", () => {
  it("says who merged it, when GitHub said", () => {
    expect(notificationText("task_done", null, "Gift notes", { merged: true, mergedBy: "dev" })).toBe("“Gift notes” is done: dev merged its pull request");
    expect(notificationText("task_done", null, "Gift notes", { merged: true })).toBe("“Gift notes” is done: its pull request was merged");
  });
});

describe("notificationText for the agent's questions", () => {
  it("puts the question to the person asked, and reminds them", () => {
    expect(notificationText("question_asked", null, "Gift notes", { question: "Which warehouse?" })).toBe(
      "The agent has a question for you on “Gift notes”: Which warehouse?",
    );
    expect(notificationText("question_reminder", null, "Gift notes", { question: "Which warehouse?", escalated: false })).toBe(
      "The agent is still waiting for your answer on “Gift notes”: Which warehouse?",
    );
  });

  it("tells the owner whose answer it's still waiting for", () => {
    expect(notificationText("question_reminder", null, "Gift notes", { askedOfName: "Maria", escalated: true })).toBe(
      "The agent's question on “Gift notes” is still unanswered by Maria",
    );
  });
});
