import { notificationText } from "@viberglass/types";

describe("notificationText for failed runs", () => {
  it("doesn't blame setup for a platform failure, and keeps the reason the task page shows", () => {
    expect(notificationText("run_failed_setup", null, "Rewrite the email", { step: "research", reason: "Agent stopped responding" })).toBe(
      "A research run on “Rewrite the email” failed and needs an admin: Agent stopped responding",
    );
  });

  it("tells the owner the reason of an agent failure", () => {
    expect(notificationText("run_failed_agent", null, "Fix rounding", { step: "research", reason: "Agent failed" })).toBe(
      "The research run on “Fix rounding” failed: Agent failed",
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
