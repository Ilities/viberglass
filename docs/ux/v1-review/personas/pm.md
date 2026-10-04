# Product/project manager: turn a request into coordinated work

You usually work as a workspace member and own the tasks you coordinate. You do not need to configure the model or runner yourself.

## Request an outcome

1. From Home, choose Ask for something, or the space under Ask for something in. You can also open a space and create a task there.
2. Give the task a short title and describe the outcome, relevant context and how you will judge success. For example: “Change the welcome text to Welcome to Acme, without punctuation. Keep the function signature. Add a regression test for the exact text.”
3. Create the task. Check its key, description and People. The creator becomes owner unless a space default or an explicit choice overrides this.
4. In People, select the owner and add reviewers. Stakeholders can use Watch themselves. An owner moves the work forward; a reviewer gives feedback; a watcher follows it.

[Task creation](../images/23-pm-create-task.png) · [PM task view](../images/pm-task.png)

## Ask the agent and coordinate decisions

Use Write research when you want to understand the existing behavior. To ask a particular agent, type @ in the conversation and pick that agent from the suggestion list, then write your request and Post. Posting to people without an agent mention is a human message; the agent reads task context when asked. You can mention a person the same way to request attention.

Read the resulting Research or Plan tab and the latest turn. If the agent asks a question, enter an answer in its answer field and submit Answer. Give a concrete decision instead of “looks good” when wording, scope or acceptance is still unclear. Someone else who can post may answer too; check the attribution and clarify conflicting answers.

When the research is useful, ask for a plan. Read the plan against the original outcome and reviewers’ feedback. Use the thread or Revise the research with comments to request changes. You may also edit documents directly when the Edit control is available. Research and planning can be revised; there is no separate approval gate to unlock code.

[Agent question](../images/37-question-for-reviewer.png) · [Plan](../images/49-plan-ready.png)

## Move toward delivery

Use Build it when the scope is clear and the repository is configured. You can request code without first writing every artifact. Inspect the code/PR result and involve an engineer for branch and review work. A completed agent turn is not the same thing as a delivered change.

You can post messages while the agent is working; new requests to the agent wait for its current turn to finish. As owner, you can Pause the agent or Interrupt with this to change direction. Let it carry on resumes paused work. Setup failures need the relevant admin/maintainer to repair the problem before Try again is useful.

Home lists tasks and requests for your attention; use Mine or Unread to narrow the list. Mark done on a mention acknowledges that request. Actions → Mark as done closes a task manually; Reopen opens it again. Archive removes finished/unneeded work from normal working lists while retaining records. Confirm the delivery outcome before closing a task; manual closure does not confirm a PR merge.

## Review/editorial notes

The PM created the main task through the UI; people assignments were fixture APIs and their UI controls were inspected. Research, answers, feedback and plan were real GLM runs. Code failed against the read-only fixture; external delivery was not tested. Agent selection, situation labels, completion wording and mobile layout need UX-04, 08, 09, 12 and 14. Do not illustrate historical versions until UX-02 is fixed.
