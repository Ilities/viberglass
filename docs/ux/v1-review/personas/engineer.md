# Engineer / space maintainer: connect code work and handle handoffs

An engineer is a persona, not a workspace role. Space maintainer access lets you configure that space and steer its tasks. A task owner can steer their own work without being a maintainer.

## Prepare the space

Open the space’s Settings to check its repository, default branch, connections and agent instructions. In Members, maintainers can manage space access, default owner/reviewers and question-reminder settings. Workspace admins supply credentials and runner configuration. Keep instructions specific to this repository and the work people will request.

Open a task from the space board/table or Overview. Read the desired outcome, latest conversation, Research and Plan, then inspect Code and its run details. Artifact tabs represent available work, not mandatory approval stages.

[Space settings](../images/10-space-settings.png) · [Engineer task](../images/engineer-task.png)

## Review code and failures

Check the change against the task’s acceptance criteria and reviewer feedback. Follow the repository/PR information shown in Code to review the branch, tests and publication state. Run records can help distinguish an agent failure from a clone/push or credential problem. Request a revision in the conversation by selecting the intended @agent.

If credentials or runner configuration fail, tell the admin what task/run failed and the safe error detail. A retry cannot repair an unchanged key or unsupported endpoint. Repository settings and branch permissions may instead be your space/repository administrator’s responsibility.

## Take over work locally

1. When Take over is available, select it. This pauses the agent and records who has the work.
2. Read the Taken over card. Use its checkout instructions for the task branch, including whether that branch has already been pushed.
3. Work in the indicated repository/branch, run appropriate checks, and push the commits you want the agent to read.
4. Write a Note for the agent describing what changed and what it should do next, then choose Hand back. The agent continues with the branch and your note.

[Taken over and checkout instructions](../images/53-taken-over.png) · [Handed back](../images/54-handed-back.png)

You can also Pause the agent temporarily and Let it carry on later. Interrupt with this posts a new instruction and stops the running turn so the agent can respond to it. Ordinary Post leaves an in-progress turn running and queues agent requests. Only owners, maintainers and admins may steer; collaborators can still give context and ask work within their permissions.

## Finish deliberately

A successful turn, a published branch, an opened PR and a merged change are distinct outcomes. Check the actual repository before declaring delivery. Actions → Mark as done is manual closure, with Reopen available afterward. Keep the task conversation and acceptance criteria as the record of what was intended and verified.

## Review/editorial notes

Takeover/handback controls and branch metadata were exercised, but no external local checkout/push or PR merge was completed. Pause was applied to an existing paused failure, not stress-tested during an active stream. Handback resumed three old sessions unexpectedly (UX-26); verify the selected work before relying on this control. Interrupt behavior here is source-verified; a separate interrupted live run was not tested. UX-02, 07, 08, 12 and 24 need attention; recapture handoff screenshots once the surrounding layout is settled.
