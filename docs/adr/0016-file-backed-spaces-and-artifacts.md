# ADR 0016: File-backed spaces produce versioned artifacts

- **Status:** Accepted
- **Date:** 2026-10-12
- **Decider:** Jussi Hallila
- **Amends:** [ADR 0001](./0001-collaborative-workspace-for-software-companies.md) (Git-only backing and deferred knowledge connectors), [ADR 0008](./0008-tasks-are-conversations.md) (storage and completion for Files tasks)

## Context

Tasks already produce artifacts through conversations, but execution assumes a repository and a pull request. People also need spaces for presentations, documents and other deliverables whose working files persist across separate harness runs and whose final destination may be Notion or Google Docs.

The product decisions were reviewed and settled on 2026-10-12.

## Decision

- A space explicitly chooses **Git repository** or **Files** backing. Existing spaces remain Git-backed, including spaces whose repository setup is incomplete. Files spaces require no repository or SCM credential.
- Tasks in a Files space share its working filesystem. Each run restores an immutable S3 snapshot into fresh compute and checkpoints changes durably. Filesystem-changing operations are serialized per space. Harness conversation state stays separate from working files.
- Final artifacts are named deliverables with immutable versions in S3, separate from working snapshots. The task thread shows produced versions; the space lists artifacts across its tasks.
- Previews support interactive JavaScript from the first preview release. Presentations are a primary use case. Serve locally bundled HTML/CSS/JavaScript on an isolated preview origin inside a sandbox; preview requires no runtime server or application credentials.
- Retain the latest X working snapshots per space and the latest X versions per artifact, automatically purging older content. The count is configurable; its initial default is an implementation detail. Current versions and active execution/delivery inputs are protected. Completed publication receipts remain after their source bytes expire.
- The app supports listing, uploading and downloading files, with editing limited to Markdown/plain text. Harnesses handle edits to presentations and other formats. Text saves create new versions and detect conflicts with intervening changes.
- Publishing is an explicit human action on a selected immutable version. Start with Notion Markdown after S3-backed delivery, with Google Docs as a later provider. The first publishing behavior creates a new destination document rather than updating an existing one.
- Workspace admins, space maintainers and task owners with space access may publish. Viewers and guests cannot publish initially. Connection setup remains admin-owned; providers use the existing plugin capability architecture.
- Files tasks finish through an explicit **Mark done** action and can be reopened. Saving or publishing an artifact does not automatically finish the task. Git-backed task completion continues to follow its pull-request workflow.

## Consequences

- The backing contract replaces repository-presence inference in creation, readiness, dispatch and worker setup. Shared agent execution and collaboration remain common to both backings.
- Git-only scope in ADR 0001 and ADR 0008 is amended for Files spaces. The collaborative product direction, existing access model and Git workflows remain in force.
- Interactive preview requires dedicated origin/deployment configuration and browser verification of presentation controls, scripts, relative assets and isolation.
- Version retention includes actual S3 cleanup, active-input protection and a readable expired-version state. Publication metadata must not depend on keeping source bytes forever.
- Markdown/plain-text editing participates in the same writer coordination as runs and uploads; immutable artifact versions are never edited in place.
- Phase 1 introduces backing, creation/readiness/settings and completion contracts. Files runs remain clearly unavailable until persistent execution is implemented. Preview, editing, retention and publishing arrive in subsequent stages of the plan.
