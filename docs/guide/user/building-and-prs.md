# Building and pull requests

When the plan is agreed, the agent builds it and opens a GitHub pull request for your engineers to review. This page covers Build it, plans in parts, pull requests, and when a task is done.

## Build it

Choose Build it under the thread. The agent works on the task's branch, pushes its commits, and opens a pull request against the space's repository. The Code tab shows the pull request and its state, and the thread links to it.

Who can ask for code depends on the workspace role and the task: members on tasks they're on, guests on tasks they're on, space maintainers and admins. See [Getting started](getting-started.md#what-your-role-lets-you-do). Build it is a request for work, not an approval.

Engineers review the pull request on GitHub like any other. The Code tab shows the pull request's open review comments. To have the agent address them, ask it in the thread: the open review comments go with your request, and its next build adds commits to the same pull request.

<!-- screenshot: Code tab with an open pull request -->

## Plans in parts

A large plan can be written in parts, each small enough for one review. The plan shows its parts in order. Builds then go part by part, each in a pull request of its own:

- Build part 1 builds the first part.
- The next part can be built once the pull request for the earlier part is merged. The Code tab shows how far it's got, such as "PR open for part 2" or "1 of 3 parts merged".
- Build the rest builds every remaining part in one pull request.

A plan without parts is built as a whole with Build it. Revising the plan leaves parts that are already built as they are.

When the work doesn't go part by part, each part's menu (⋯) in the plan has a way around it:

- Mark done, for a part finished some other way, such as by hand in another pull request. If its pull request is still open, it stops holding up the next part, which gets a pull request of its own.
- Skip this part, for a part that isn't needed after all.
- Discard this build, for a build that stopped before opening its pull request, so its parts show Building with nothing happening. Its parts can then be built again. It isn't offered while the agent is working.

A mark can be taken back from the same menu, and a merge always counts over it. Marking the last part that's left finishes the task, as a merge would.

While a part's pull request is open, the next part has Add to part N's pull request. The agent builds that part on the same branch, and the one pull request then covers both parts.

## When a task is done

A task is done when the pull requests for all of its plan are merged, or its remaining parts are marked done or skipped. Viberglass checks the state of open pull requests regularly, so a merge on GitHub closes the task within about an hour. The requester and owner are told.

You can also finish a task by hand with Actions → Finish task, for work that ended another way. That keeps the history and merges nothing. Reopen task opens it again.

## Another round

To pick up a finished task again, choose Actions → Reopen task, then ask the agent in the thread as usual. The task keeps its conversation, its plan and its branch, so follow-up work starts from where it ended.

## Checking the result

A completed agent turn, a pushed branch, an open pull request and a merged change are different things. Before you tell people something has shipped, check that its pull request is merged. Run details on each turn shows what the agent did, and the run's record shows whether the build pushed and opened the pull request.
