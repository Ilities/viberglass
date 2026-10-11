# ADR 0008: Tasks are conversations

- **Status:** Accepted
- **Date:** 2026-10-01
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0003](./0003-product-leader-as-primary-persona.md) (who the users are), [ADR 0006](./0006-agent-questions-and-session-continuity.md) (sessions), [ADR 0007](./0007-iterating-on-a-task.md) (iterating), and the approval policy
- **Amended by:** [ADR 0009](./0009-the-plan-includes-the-research.md) (the plan includes the research), 2026-10-06; [ADR 0010](./0010-building-the-plan-in-parts.md) (done is every part merged), 2026-10-06

## Context
The plan so far treats a task as a pipeline with gates. One person asks, the agent writes a document, an eligible person approves, and the next step runs. People talk about the task on the side: in a Discussion the agent never reads, in comments it reads only when someone asks for changes, and in live sessions on a separate page. A walkthrough of returning visits found that nobody could tell whose move it was, or which of those channels reached the agent.

That isn't how Viberglass is used. Its real users are:
- **Software teams** (product owners, engineers, QA) who iterate on one task **together** to plan and implement it.
- **Individual non-engineers** who want one-off changes to auxiliary sites, such as a landing page or a marketing site, and don't know how to make them.

The direction is **long-running chats** between the people on a task and one or more agent harnesses, all aimed at finishing that task.

## Decision
- **A task is a conversation that produces artifacts.** Each task has one thread. People post in it, and so does the agent. Research, plans and code (a pull request) are **artifacts** the conversation produces. Each new version appears in the thread, where people open it, comment on it and compare it with the last one.
- **People bring the agent in by @mentioning it, or by pressing an action.** The agent doesn't answer every message. An @mention ("@agent update the plan with Tomi's point") starts a turn with the person's own words. Buttons under the latest artifact offer the common next moves (*Revise with these comments*, *Write the plan*, *Build it*), so nobody needs to know the magic words. A button posts an ordinary, attributed message and starts the same kind of turn.
- **A turn reads everything since the agent's last turn**: messages, comments on the artifact, and who agreed to what. It produces the next version of the artifact, or answers. The agent first says in one line what it's about to do ("Revising the plan: adding Tomi's point about the packing slip"), so the thread shows how it read the request.
- **Agreement replaces approval gates.** There's no separate Approve step for research or the plan. The decision to go on is the message or button press that asks for it ("Jussi asked the agent to build it"), recorded under that person's name in the thread and in Activity.
- **Research → Plan → Build are kinds of artifact, not gates.** A task produces whichever it needs. A team's product task usually goes research, then plan, then code. A landing-page change can go straight to code. The task page shows what exists so far, not a sequence that has to be passed.
- **Done is a merged pull request.** A merge closes the task. Deploying is outside Viberglass; where a repository's pull requests already get preview links (Vercel, Netlify and the like), the PR artifact shows them.
- **Long context is compacted by the harness, using our prompt.** When a task's context gets long, Viberglass asks the harness to compact it with a product-defined prompt that keeps decisions, who agreed to them, and open questions. It runs automatically past a threshold, and people can ask for it ("Summarise so far"). The summary is posted in the thread, so people can see what the agent now believes was agreed and correct it.
- **More than one harness per task is allowed, and its cost is visible.** Each harness keeps its own resumable session on the task. Bringing in a second harness, or switching, is a **cold start**: no shared session and no prompt cache, so it reads the compacted summary and the artifacts. That's an explicit action ("Bring in Codex: starts fresh and reads the task"), never a side effect of naming another agent.
- **Storage stays git for now (ADR 0001).** Outputs are called artifacts rather than "documents" or "pull requests" in the model and the UI, so that other tools (Notion, Confluence, Google Docs) can produce artifacts later without changing the structure.

## Consequences
- **ADR 0003:** the product leader is no longer *the* primary persona. The two user groups above are. Setup by a non-engineer (three inputs) still holds, since the individual non-engineer needs it most.
- **ADR 0006:** a task's conversation is the session. `ask_human` still routes an agent's question to a person, as a message in the thread that mentions them. Each turn is still its own job that resumes with `session/load`, which suits a conversation: nothing holds a worker while people talk. The session branch (D9) becomes the task's branch for code artifacts.
- **ADR 0007:** "ask for changes" and "reopen" become ordinary turns ("@agent revise the research"). Every artifact keeps its versions.
- **The approval policy (§2.7) narrows to one rule: who may ask the agent to write code.** That's the step that writes to the repository and costs the most. The default is the task's people and the space's maintainers, and guests when they're on the task. Asks for research and plans are open to everyone on the task who can post. `canApproveStep`, `ApprovalPolicyService` and `approveUpTo` become that rule; the "Approve" buttons go.
- **Discussion, document comments and live sessions merge into the thread.** Comments anchored to an artifact's text stay, shown in the thread and on the artifact.
- **"Whose move" still matters.** It becomes "someone mentioned you", "the agent asked you", or "the agent is working", shown on threads the way chat apps show mentions. Home and the Inbox become one list of the tasks you're in, by activity, with unread counts and mentions flagged.
- **Phase 2½ (returning visits) and Phase 3 (agent ↔ human) are planned as one phase**: the task as a conversation. Steering, questions, readable transcripts and session continuity are what the conversation is made of.
- **Turns must be explainable in cost:** a turn says which harness ran and whether it resumed or started cold.
