# Reviewer: understand the result and give actionable feedback

You may be a member or an invited guest. Reviewer is a relationship on a task, not a workspace role. Guest reviewers work in the spaces they have joined.

## Join and find your review

1. Follow your invitation link, enter your name and password, and choose Join.
2. Open Home to find requests for your attention. Open the named task, or go to its space and find its key/title.
3. Read the task description, owner and latest turn before reviewing the artifact. Check whether the agent needs an answer or has produced something for review.

[Invitation](../images/07-accept-invite.png) · [Reviewer Home](../images/reviewer-home.png)

## Give feedback on research or a plan

1. Open Research or Plan and read the current document.
2. Select the relevant rendered text. Use the offered comment action to write the change you want and why. Add comment saves it with the selected passage.
3. For exact replacement wording, choose Suggest a change instead of Comment, then submit the proposed wording. Comments is where you can revisit document feedback and its resolution state.
4. Use the conversation for broader feedback or decisions. Type @ and select a person from the suggestions to ask for their attention; choose Post to send it.
5. If available, Revise the research with comments asks the agent to use the outstanding feedback. Check the next artifact rather than assuming the comment has been applied.

[Inline feedback](../images/34-inline-comment.png) · [Comments panel](../images/36-review-comments-panel.png)

Good feedback is specific: “Keep the exact string Welcome to Acme without punctuation, and add a test that asserts it.” In the review fixture, that feedback was incorporated into the real plan.

## Answer and follow up

Answer an agent’s question in its answer field and choose Answer. You can help answer a question addressed to somebody else when you have posting permission; the history records who answered. Mention the owner if their decision is needed.

Use Watch under People to follow the task, and Stop watching to leave that follow relationship. Home’s Mark done acknowledges a mention/review attention item; it does not mean the task or PR is finished. Reviewer participation can allow code requests, including for a guest, so treat Build it as a work request rather than a review-approval button.

## Current limitations

Opening an older Research version from the thread currently shows the latest document. Use the current artifact for review and confirm its content/time; do not rely on the old-version label until fixed. The @mention picker works with a pointer, but ArrowDown/Enter selection was defective in this build. These are product defects, not intended workflow.

## Review/editorial notes

Invite acceptance, pointer mentions, watching, answering two real questions, selecting text and posting feedback were exercised. Exact replacement suggestions and resolving/reopening comments were inspected in code, not separately executed. Historical version, keyboard/ARIA semantics and feedback preview need UX-02, 10, 11 and 13. Review screenshots require recapture after those fixes.
