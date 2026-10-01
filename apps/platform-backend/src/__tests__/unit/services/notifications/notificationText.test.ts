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
