# ADR 0009: The plan includes the research

- **Status:** Accepted
- **Date:** 2026-10-06
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0008](./0008-tasks-are-conversations.md) (kinds of artifact), [ADR 0001](./0001-collaborative-workspace-for-software-companies.md) (the flagship workflow)
- **Amended by:** [ADR 0010](./0010-building-the-plan-in-parts.md) (building the plan in parts), 2026-10-06

## Context
ADR 0008 made research, plan and code kinds of artifact that a task's conversation produces, rather than gates. A task still offered research and a plan as two separate documents, and a team's product task usually went research, then plan, then code.

That isn't how agents are used outside Viberglass. Working locally with a coding agent, people ask for one thing: a plan that starts by reading the code. The agent's findings and its proposed change come back together, people discuss and revise that one document, and then it's built, either all at once or a part at a time. Two documents meant two asks, two reviews and a research document nobody went back to once the plan existed.

## Decision
- **One artifact before code: the plan.** Asking for a plan has the agent read the code that matters first, and the plan starts with what it found (the relevant code, the root cause, constraints and risks), followed by the proposed solution, the implementation steps, the files to change and how to test it.
- **Research is no longer its own artifact, action or step.** A task produces a plan, code, or both. A small change can still go straight to code.
- **Existing research is deleted, not folded into plans.** Viberglass has no users yet, so there's nothing to carry over.
- **Building the plan a part at a time is the next step.** The plan is what code is built from, either as a whole or step by step, with each part reviewable on its own. That's decided separately; this ADR only removes the separate research.

## Consequences
- **ADR 0008:** "Research → Plan → Build are kinds of artifact" becomes "Plan → Build". The suggested actions are *Write the plan*, *Revise the plan with N comments* and *Build it*. Asks for a plan stay open to everyone on the task who can post; who may ask for code is unchanged.
- **ADR 0001:** the flagship workflow is Plan → Build → PR.
- **ADR 0007:** reopening research no longer applies; the plan is revised in the thread like any artifact.
- The task turn prompt drops its research instructions, and the cold start no longer carries the research. A per-space override of the prompt is edited in place, so the override keeps its other changes.
- A task starts in the plan step. Its step is the build once there's a pull request, else the plan.
