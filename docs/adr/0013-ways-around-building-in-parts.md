# ADR 0013: Ways around building the plan in parts

- **Status:** Accepted
- **Date:** 2026-10-08
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0010](./0010-building-the-plan-in-parts.md) (a part's state comes only from its pull request; parts are built in order, one pull request each)

## Context
ADR 0010 made a part's state come only from its pull request, and let a later part be built only once every earlier part's pull request is merged. That keeps the record honest, but real work doesn't always go that way, and some situations had no way out short of editing the database:

- A part gets done some other way: by hand in another pull request, or folded into an earlier part's work.
- A part turns out not to be needed. The parts after it can't be built, and the task can't finish on its own.
- A build fails before it opens its pull request. Its claim on the parts stays, so they read as being built, and no build is offered.
- Someone would rather add the next part to the open pull request than wait for it to merge.

## Decision
- A person can mark a part done or skipped. A mark is a person's statement, recorded with who made it, and is shown as such: "Done" and "Skipped", not "Merged". A merge counts over a mark. A mark can be taken back.
- For building in order and for finishing the task, a part is finished once merged, done or skipped. A pull request whose parts are all finished no longer blocks the next part, which gets a branch and pull request of its own.
- Marking the last unfinished part finishes the task, as the last merge does, credited to the person who marked it.
- A build that never opened its pull request can be discarded while nothing is running on the task. Its parts can then be built again.
- The next part can be added to the open pull request. The pull request then covers it, and the build that adds it works on the same branch, told which part it adds and which parts the pull request already builds.
- These are for whoever may ask for a build. They sit with the plan's parts rather than among the thread's suggested actions, so the usual path stays one part, one pull request.

## Consequences
- Marks are stored per task and part number, beside the pull requests. Where the plan stands is worked out from both.
- The Code tab's progress reads "2 of 3 parts done" once a part was marked rather than merged.
- The build prompt has a sentence for a build that adds parts to the open pull request. A revision of the plan is told done parts are built; skipped ones aren't.
- Activity records each mark, each mark taken back and each discarded build.
- ADR 0010: a part's state comes from its pull request or a person's mark, never from the plan's text; parts are built in order unless added to the open pull request.
