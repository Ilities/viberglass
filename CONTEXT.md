# Viberglass

A self-hosted workspace where people and AI agents work together on tasks, and where the software those tasks build can run for the workspace.

## Language

### Apps

**App space**:
A space whose purpose is one app. It is backed by a git repository that Viberglass creates and manages, which its people never need to deal with.
_Avoid_: App project, Git space with an app

**App home**:
The workspace-wide code host connection and owner where Viberglass creates every App space's repository. Set once by an admin.
_Avoid_: App organisation, app registry

**App**:
Software Viberglass runs for the workspace, built from an App space. Each App space has exactly one app.
_Avoid_: Deployment, site, project, hosted app

**Release**:
One immutable built version of an app, built from a merge to the space's default branch. The release an app is serving is its current release.
_Avoid_: Deployment, publish, build, version

**On / Off**:
Whether an app is running. Only the space's maintainers and the space's schedules turn an app on or off. People who open an app that's off are told who can turn it on.
_Avoid_: Asleep, scaled to zero, paused, stopped

**Preview**:
A temporary running copy of an app built from a change, starting from a copy of the live data. Try it starts one; it turns off at night and when nobody opens it for a while, and nothing done in it reaches the app. It never becomes a release.
_Avoid_: Staging, preview environment, preview release

**Change**:
A task's proposed edit to an app, shown in an App space instead of a pull request. People try it in a preview, then make it live.
_Avoid_: Pull request, PR, diff (in App space copy)

**Make it live**:
The action that accepts a change, which builds a release and makes it the app's current release. Only the space's maintainers and the task's owner can take it, once the change's latest version has run in a preview.
_Avoid_: Merge, deploy, publish, ship

**Roll back**:
Making an earlier release the app's current release again, with today's data or with the data as that release left it. Only the space's maintainers can do it. The newer releases are set aside and don't go live by themselves, but their code stays on the default branch, so the next change made live brings it back.
_Avoid_: Revert, undo, downgrade

**Data backup**:
A point-in-time copy of an app's data, taken before every release and rollback, or by a maintainer. Only maintainers can restore or download one.
_Avoid_: Snapshot (that's a Files space's working-file checkpoint)

**App setting**:
A named value a maintainer gives an app, either plain or secret. Secret values are never shown again and never reach the agent.
_Avoid_: Env var, config, app secret

**App user**:
A workspace role for people who only use apps. They see no spaces, tasks or settings, and land on a list of the apps they can open.
_Avoid_: End user, customer, app guest

**App access list**:
The people, beyond the space's members, who may open an app. Maintained by the space's maintainers.
_Avoid_: App members, sharing
