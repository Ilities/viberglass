# Product/project manager: turn a request into coordinated work

You usually work as a workspace member and own the tasks you coordinate. You do not need to configure the model or runner yourself.

## Request an outcome

1. From Home, choose Ask for something, or the space under Ask for something in. You can also open a space and create a task there.
2. Give the task a short title and describe the outcome, relevant context and how you will judge success. For example: “Change the welcome text to Welcome to Acme, without punctuation. Keep the function signature. Add a regression test for the exact text.”
3. Create the task. Check its description and People; the key, severity, category and created date are folded into the Task details line. The creator becomes owner unless a space default or an explicit choice overrides this.
4. In People, select the owner and add reviewers. Stakeholders can use Watch themselves. An owner moves the work forward; a reviewer gives feedback; a watcher follows it. What owner, reviewer and watcher mean explains this on the task.

[Task creation](../images/23-pm-create-task.png) · [PM task view](../images/pm-task.png)

## Ask the agent and coordinate decisions

Use Write research when you want to understand the existing behavior. The line above the suggested actions says which agent the next ask goes to and why (already on the task, workspace default or first ready agent), and whether it picks up its conversation or starts fresh. To ask a different agent, type @ in the conversation and pick that agent from the suggestion list, then write your request and Post. Posting to people without an agent mention is a human message; the agent reads task context when asked. You can mention a person the same way to request attention.

Read the resulting Research or Plan tab and the latest turn. Each agent turn shows a one-sentence intent and a result line such as “Wrote the research.”; Show what it said opens the full reply. If research or a plan finishes without the document, it shows as failed rather than done. If the agent asks a question, it appears in full in the answer card, which says whom it is for; enter an answer and submit Answer. Give a concrete decision instead of “looks good” when wording, scope or acceptance is still unclear. Someone else on the task may answer too; the thread shows who answered for whom, so check it and clarify conflicting answers.

When the research is useful, ask for a plan. Read the plan against the original outcome and reviewers’ feedback. Reviewer comments appear in the thread with their text, a short quote, Open/Resolved and Open in comments. Use the thread or Revise the research with comments to request changes. You may also edit documents directly when the Edit control is available. Research and planning can be revised; there is no separate approval gate to unlock code.

[Agent question](../images/37-question-for-reviewer.png) · [Plan](../images/49-plan-ready.png)

## Move toward delivery

Use Build it when the scope is clear and the repository is configured. You can request code without first writing every artifact. Inspect the code/PR result and involve an engineer for branch and review work. A completed agent turn is not the same thing as a delivered change.

You can post messages while the agent is working; new requests to the agent wait for its current turn to finish. As owner, you can Pause the agent or Interrupt with this to change direction. Let it carry on resumes only the work the task was on last; the card says which agent and step will resume. After a failed turn, Try again retries with the same agent and names it. Setup failures that won't fix themselves, such as a rejected key, need a workspace admin to repair them; the failure card says so and Try again is not offered until then.

Home lists tasks and requests for your attention, and Needs you explains each one; use Mine or Unread to narrow the list. Acknowledge mention stops a mention being your move and leaves the task unchanged. Actions → Finish task closes a task manually and keeps its history; Reopen task opens it again. Archive removes finished/unneeded work from normal working lists while retaining records. Overview groups work into Needs attention, Agent working, Waiting on people, Not started and Done this week, counting each task once. Confirm the delivery outcome before finishing a task; finishing merges nothing.

On a phone, use the Conversation / Artifacts switch to move between the thread and documents, and Write a reply to jump to the composer.

## Review/editorial notes

The PM created the main task through the UI; people assignments were fixture APIs and their UI controls were inspected. Research, answers, feedback and plan were real GLM runs. Code failed against the read-only fixture; external delivery and real PR merge were not tested. Any person who can post may answer a question addressed to someone else; this is by design. Screenshots need recapture after the task-page and Overview changes.
