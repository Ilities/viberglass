# User guide baseline

These guides describe the current application reviewed on 2026-10-03. Select the guide closest to your work; one person may use several. Each guide ends with review/editorial notes that should be removed or resolved before publication. The UI proposals in [mockups](../mockups/index.html) are separate from these instructions.

| Your work | Guide | Starting access |
|---|---|---|
| Set up the workspace, people and agents | [Administrator](admin.md) | Workspace admin |
| Coordinate outcomes and decisions | [Product/project manager](pm.md) | Workspace member; typically task owner |
| Configure a space and handle code | [Engineer / space maintainer](engineer.md) | Member + space maintainer, or task owner for steering |
| Review work and give feedback | [Reviewer](reviewer.md) | Invited member or guest on the task |
| Follow progress and contribute context | [Watcher / stakeholder](watcher.md) | Member or guest with access; watching is task participation |
| Read visible work | [Viewer](viewer.md) | Workspace viewer |
| Ask for a change in plain language | [Individual requester](requester.md) | Workspace member |

## Shared terms

- **Workspace:** the installation and its people, agents, credentials and connections.
- **Space:** a group of related tasks, with membership and shared defaults. Private spaces are visible to their members and workspace admins. Members/viewers can see open spaces; guests see spaces they belong to.
- **Task:** a requested outcome with a key, description, people, artifacts and conversation.
- **Home:** your tasks and requests for your attention. **Overview:** work across the spaces you can see. Viewers land on Overview.
- **Requester:** the person who created the task. **Owner:** the person responsible for moving it forward. **Reviewer:** someone asked to look at results. **Watcher:** someone following the task. These are task relationships, not workspace roles.
- **Agent / runner:** the agent software and its configured model, credentials and compute. Admins configure these; people ask them to work from task conversations.
- **Turn:** one agent response to a request. **Run:** its execution record. A task can have many turns and runs.
- **Research / Plan / Code:** available work artifacts. Research and planning help clarify a request; they are not mandatory approval stages.
- **Your move:** there is a request for your attention. Read its context to distinguish a question, review request, mention or failure.

## Access at a glance

| Access | Read | Contribute / ask | Configure / steer |
|---|---|---|---|
| Admin | All spaces | Yes | Workspace setup and task steering |
| Member | Open spaces + private memberships | Post/ask on visible tasks; code requests depend on task participation or maintainer access | Own-task steering; space configuration if maintainer |
| Guest | Spaces joined | Contribute/ask on tasks they participate in, including code requests | Own-task steering if owner; no workspace administration |
| Viewer | Open spaces + private memberships | Read-only; no watching control | No task steering |
| Space maintainer | Their visible spaces | Request work in maintained space | Change that space’s settings/members/defaults and steer its tasks |

Hiding a control can be intentional. Ask an admin about access rather than assuming you need another account. Watching does not turn a member into a read-only viewer.

## Notifications and completion

Open Settings → Notifications to see whether Slack is connected and which email address receives task/setup messages. Delivery depends on workspace configuration. Home attention, a mention’s Mark done, and a task’s Mark as done are different things. Acknowledging a mention does not finish the task. Manual task closure does not by itself prove that a pull request was merged.

Use [current-app screenshots](../gallery.html) as evidence, and [the screenshot manifest](../SCREENSHOTS.md) to decide which images can be published. Fixture names and local URLs must be replaced with your documentation examples if needed.
