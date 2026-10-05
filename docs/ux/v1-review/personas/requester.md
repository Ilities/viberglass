# Individual requester: ask for a useful change without configuring agents

Use this guide when you work independently or simply need an outcome. You need member access to a usable space; an administrator prepares the agent and repository connection.

## Make a clear request

1. From Home, select Ask for something or choose the intended space under Ask for something in.
2. Write a title that states the outcome. In the description include context, the desired behavior and a concrete way to check it.
3. Create the task and note its key. Check People: you normally own it unless the space has another default.

Example: “Make the welcome text say Welcome to Acme, without punctuation. Keep the existing function signature. Verify the exact result with a regression test.” You do not need to name source files if you do not know them.

[Create a task](../images/22-create-task.png)

## Work through the conversation

Use Write research to ask the agent to explain what exists and what needs to change. The line above the suggested actions tells you which agent will take the request. For a question or follow-up, type @, choose the agent from the suggestions, write your request and Post. Picking a person instead asks for human attention. The suggestion must be selected; a plain @word is not necessarily an agent request.

Read the answer and available artifact. If research finishes without the document, it shows as failed, so you know to ask again. If the agent asks you something, use its answer field and Answer to give a decision. Describe exact wording, scope or constraints when those matter. Ask “Write a short plan using this decision” if you want to understand the proposed work before requesting code.

Research and Plan are optional aids, not approval forms; they can be asked for in any order. You can ask for revisions and request code directly. Build it asks the agent to implement the work using the configured repository. If you want help judging the result, add a reviewer in People or mention a teammate. On a phone, switch between Conversation and Artifacts, and use Write a reply to jump to the composer.

## Recognize when help is needed

- If you see a question, answer it or ask the person who can decide.
- If an artifact is ready, compare it with your request and give specific feedback.
- If credentials/setup or repository publication fails, the failure card says who can fix it; share the task key with them. Try again is not offered for setup problems until they are fixed; for other failures it retries with the same agent.
- If the agent is working in the wrong direction and you own the task, use Pause the agent or Interrupt with this. Otherwise post clarifying context for its next turn.

Use Home to return to your work. Acknowledge mention when no response is needed; this leaves the task unchanged. Finish the task through Actions → Finish task only when the outcome is satisfied; this keeps history and merges nothing, so it is not proof of merged code. Reopen task lets you continue the task, and Archive removes unneeded work from regular working lists.

## Review/editorial notes

This guide follows the member/owner journey exercised by the PM fixture; no separate recruited solo-user session was conducted. Published screenshots should be recaptured after the agent selection, failure and task-layout changes.
