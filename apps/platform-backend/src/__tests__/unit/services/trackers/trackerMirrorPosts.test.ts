import { planSummary, questionPost, replyPost } from "../../../../services/trackers/trackerMirrorPosts";

describe("tracker posts", () => {
  it("sums a plan up by its first paragraph, skipping headings and tables", () => {
    expect(planSummary("# Gift notes\n\n| a | b |\n\nCheckout has no note field. Add one.\n\n## Part 1")).toBe("Checkout has no note field. Add one.");
    expect(planSummary(`intro ${"x".repeat(600)}`)).toHaveLength(500);
  });

  it("cuts a long reply with a link to the rest", () => {
    const post = replyPost("Claude", "y".repeat(5000), "https://vg.example/spaces/web/tasks/WEB-1");
    expect(post).toContain("[Read the rest in Viberglass](https://vg.example/spaces/web/tasks/WEB-1)");
    expect(post.length).toBeLessThan(4200);
  });

  it("asks a question with its options, and says how to answer", () => {
    const post = questionPost(
      {
        id: "q",
        sessionId: "s",
        agent: { id: "a", name: "Claude" },
        askedOf: { id: "m", name: "Maria" },
        question: "Which warehouse?",
        options: ["North", "South"],
        blocking: true,
        status: "open",
        askedAt: "t",
        answer: null,
      },
      null,
    );
    expect(post).toBe("**Claude asks Maria:** Which warehouse?\n\n- North\n- South\n\nReply here to answer, or answer in Viberglass.");
  });
});
