# Artifact spaces: persistent files, previews and publishing

- **Status:** Product decisions accepted; phases 1–3 implemented and verified on 2026-10-12, their known gaps closed on 2026-10-13. Publishing (phases 4–5) remains planned.
- **Date:** 2026-10-12.
- **Baseline:** `main` at `6f05b6f9`, branch `feat/artifact-spaces-plan`.
- **Requested outcome:** create a space without Git, retain its files across harness runs, save final artifacts in S3, preview web-compatible output, and publish a selected version to an external destination.

## Contents

- [Direction and boundaries](#direction-and-boundaries)
- [Existing implementation](#existing-implementation)
- [User journey](#user-journey)
- [Domain and persistence](#domain-and-persistence)
- [Run lifecycle](#run-lifecycle)
- [Preview contract](#preview-contract)
- [Publishing contract](#publishing-contract)
- [Implementation stages](#implementation-stages)
- [Phase 1 implementation and verification](#phase-1-implementation-and-verification)
- [Phase 2 implementation and verification](#phase-2-implementation-and-verification)
- [Phase 3 implementation and verification](#phase-3-implementation-and-verification)
- [Accepted decisions and remaining details](#accepted-decisions-and-remaining-details)

## Direction and boundaries

Introduce an explicit **Files** backing alongside **Git repository** backing. A Files space owns a persistent working filesystem whose durable representation is an immutable S3 snapshot. Each run restores a snapshot into a fresh local directory and saves its changes before completing. Selected outputs become versioned artifacts independently of the rest of the working files.

The core distinction is:

| Concept | Purpose | Scope and persistence |
| --- | --- | --- |
| Workspace | The existing installation and its people, connections and runners | Existing database model |
| Space | Shared context, members, instructions and backing choice | Existing space/project record |
| Working files | Inputs, notes, intermediate work and output sources used by runs | One filesystem per Files space, versioned snapshots in S3 |
| Harness session state | Conversation history and harness-specific resume data | Existing per-session archive; separate from space files |
| Artifact | A named deliverable a task produces | Belongs to a space and task; keeps immutable file versions in S3 |
| Publication | Delivery of one artifact version to a specific destination | Durable operation and external document reference in PostgreSQL |

**Accepted first-version choices:** shared files per space; one filesystem-changing run at a time per space; full snapshots rather than incremental sync; interactive JavaScript previews, particularly presentations; explicit human publishing; destination creation only, with external updates deferred; automatic retention of the latest X versions; in-app editing limited to Markdown/plain text.

The first useful release ends at persistent files, versioned S3 artifacts, preview and download. External publishing follows as an independent stage. A destination connection is optional and never blocks artifact generation. Git-backed tasks retain their current behavior.

The accepted amendment is recorded in [ADR 0016](adr/0016-file-backed-spaces-and-artifacts.md). It changes the scope deferred by [ADR 0001](adr/0001-collaborative-workspace-for-software-companies.md) and the Git storage and merge completion rules in [ADR 0008](adr/0008-tasks-are-conversations.md). Keep the task/thread model, naming in [ADR 0004](adr/0004-naming-space-and-task.md), access rules in [ADR 0005](adr/0005-roles-and-space-visibility.md), and plugin architecture in [ADR 0015](adr/0015-harnesses-and-integrations-are-plugins.md).

Initial exclusions: live shared mounts, parallel writers with automatic merging, rich-text/HTML/presentation/code editors in the app, runtime servers, arbitrary application deployment, bidirectional connector sync, automatic publishing after every run, and Git/Files conversion. Harnesses handle editing beyond the Markdown/plain-text editor.

## Existing implementation

Paths below are relative to the repository root and describe the inspected baseline, rather than capabilities already delivered by this plan.

| Area | Current behavior | Planned change |
| --- | --- | --- |
| `apps/platform-frontend/src/pages/NewProjectPage.tsx` | Can create a space with code host set to None | Make Files backing explicit; distinguish it from an unfinished Git setup |
| `apps/platform-frontend/src/pages/setup/SpaceStep.tsx`, `apps/platform-backend/src/services/setup/SetupSpaceService.ts` | First-space setup requires a repository | Offer a Files path that skips code host and repository setup |
| `apps/platform-backend/src/services/ProjectReadinessService.ts` | Missing repository/SCM credential blocks automation | Files readiness checks storage and runner, without SCM requirements |
| `apps/platform-backend/src/services/ticketRunOrchestration.ts` | Rejects missing source repository and builds repository payloads | Resolve backing before assembling a run, keeping shared runner/tool setup |
| `apps/platform-backend/src/services/taskTurns/TaskTurnJobDispatcher.ts` | Always sends a repository and selects a task branch | Send a typed workspace backing and pinned snapshot for Files runs |
| `apps/viberator/src/workers/core/jobPipeline.ts` | Always clones, prepares a branch and reads HEAD | Delegate workspace preparation to a backing strategy |
| `apps/viberator/src/workers/core/runSessionTurnJob.ts` | Git change detection, discard and pull-request delivery | Files runs checkpoint files and register artifact versions |
| `apps/viberator/src/workers/core/turnArtifacts.ts` | Collects `PLAN.md` and `SUMMARY.md` as task documents | Preserve these semantics; add a distinct file-deliverable contract |
| `packages/agent-core/src/types.ts`, `apps/viberator/src/workers/core/types.ts`, `apps/platform-backend/src/types/Job.ts` | Execution/job contracts carry required repository fields | Introduce a discriminated backing contract; avoid dummy repository URLs |
| `apps/viberator/src/workers/entrypoints/cli-handler.ts`, `lambda-handler.ts` | Validate repository presence | Validate according to backing; retain existing login-job handling |
| `apps/viberator/src/workers/runtime/SessionStateManager.ts` | Saves harness home state separately; storage failures can be nonfatal | Reuse transport primitives, with mandatory persistence for space files |
| `apps/platform-backend/src/services/job/WorkerStorageService.ts` | Kubernetes grants allow exact bootstrap reads and one conversation archive write | Add separately authorized space-snapshot uploads and finalization |
| `apps/viberator/src/workers/infrastructure/workerObjectStorage.ts` | Upload method assumes one session archive destination | Keep session storage narrow; introduce a separate workspace-storage contract |
| `packages/integration-core/src/backend/IntegrationPlugin.ts` | Repository, webhook, commenter and chat capabilities | Add a publisher capability when introducing the first destination |

Reuse the configured S3-compatible client, secret delivery and callback authentication described in [portable storage and credentials](portable-storage-and-credentials.md). Extend their exact-object grants; granting a whole space prefix to a harness is unnecessary.

The current installation model does not justify adding a new tenant catalog. Authorize using existing space membership, task ownership, job linkage and callback scope. Storage keys identify the owning space; a key prefix alone never grants access.

## User journey

1. **Create space.** Choose `Git repository` or `Files`. Files needs a name and the usual people/instruction defaults; runner selection follows existing defaults. A tracker remains optional. Explain that files are retained between runs. Show storage availability as readiness rather than asking members to configure a bucket.
2. **Add context.** A Files view supports file upload, listing, download and a Markdown/plain-text editor. Uploads and text saves become a new snapshot through the same write serialization as runs. Harnesses edit other formats, including presentations. Instructions remain space settings.
3. **Ask for work.** Use the existing task conversation, mentions and questions. In a Files space, the main output action is `Create artifact` or `Revise artifact`; do not label it as writing code or opening a PR. Plans and summaries continue to serve their existing purposes.
4. **Resume.** Each new run sees the last committed space files, including work from another task or harness in that space. The thread shows `Preparing files`, `Agent working`, and `Saving files`. A waiting run shows `Waiting for another run to save this space`.
5. **Review.** The thread receives an artifact card with name, version, producer and Preview/Download actions. A space Artifacts view lists deliverables across tasks. Open a version, interact with a presentation, return to the thread, and ask for revisions. The latest X versions remain available; older versions are automatically purged.
6. **Publish.** Select an immutable version, connection and parent page/folder. Show the title and any conversion limitations before the Publish action. Report progress, failure or an external document link on the artifact and in the task thread.
7. **Finish.** Files task completion is an explicit `Mark done` action. Saving or publishing does not silently close the task, because one task may produce several artifacts or need no external destination. A finished task can be reopened for another revision.

Settings expose backing, storage usage and optional publishing destinations. Repository settings apply to Git spaces. Members see product language such as Files and Publish; S3 bucket/key configuration belongs to installation administration.

Use existing framed-button conventions: one primary action per row and outlined secondary actions. Preview/download authorization follows space visibility even where a reader cannot see the Runs view.

## Domain and persistence

### Space backing and working snapshots

Add `backingKind: 'git' | 'files'` to the existing space/project model. Backfill every existing space as Git, including spaces that currently lack SCM configuration. Absence of a repository must not silently convert an unfinished Git space into a Files space. Enforce incompatible backing/SCM changes on the server; changing backing after creation is deferred.

A Files space has a current snapshot pointer, initially empty. Snapshot records contain space ID, parent snapshot ID, creating job or uploading user, immutable archive reference, archive digest, manifest, total bytes and timestamps. The manifest enumerates normalized relative paths, byte counts and content digests. Use UUIDs for server-assigned snapshot/version identities.

Use S3 objects such as `spaces/{spaceId}/snapshots/{snapshotId}/workspace.tar.gz`. Snapshots are complete trees: deletions are represented by absence from the next manifest. PostgreSQL owns the current pointer; do not overwrite an S3 `latest` object or depend on bucket versioning to identify revisions.

Persist user-owned files under the working root. Exclude harness homes, credential caches, mounted credentials, injected instructions, task plan/summary files, platform control files and reproducible dependency caches. Define reserved paths explicitly so legitimate deliverables are not accidentally excluded. Stage platform files separately or restore their previous content before checkpointing.

Initial proposed limits are 100 MiB of uncompressed working data, 10,000 files, and 25 MiB per previewed file. Enforce these in upload, archive validation and restore, with a readable failure. Confirm the limits against expected use before implementation; archived history also needs a total storage budget.

### Artifacts and versions

Add separate artifact and artifact-version records. An artifact holds its space/task, title and current version. A version holds producing job/turn, snapshot ID, format, entrypoint, file manifest and immutable content references. Store source bytes and preview assets in S3, with metadata and relationships in PostgreSQL.

A deliverable can be a single Markdown/PDF/image file or an HTML/CSS/JavaScript bundle with assets, including an interactive presentation. Bundle dependencies locally; preview does not require a runtime server or access to a CDN. Use an explicit run output manifest, for example a reserved `.viberglass/artifacts.json` file, listing title, optional existing artifact ID, entrypoint and included relative paths. The worker validates it; the backend checks it against the uploaded snapshot before accepting versions.

Validate any existing artifact ID against the run's task and space. Do not infer identity from filenames or titles. Files can persist without being artifacts: working notes should not appear as final outputs. An artifact-producing action with no valid output fails clearly while retaining its valid working-file checkpoint.

Final artifact bytes are copied into server-owned version keys such as `spaces/{spaceId}/artifacts/{artifactId}/versions/{versionId}/...`. They survive later file changes and snapshot pruning, until their own retention policy purges them. Publication records reference version identities, never mutable working paths.

Plan and summary revisions remain in their existing document flow. Extend task-turn products/outcomes with a file-artifact result rather than replacing all existing documents/PRs with a new universal abstraction.

### Writer coordination

Start with one writer per Files space, covering all tasks, harnesses, scheduled runs, user uploads and Markdown/plain-text saves. Use a PostgreSQL-backed lease with holder job/operation, expiry and a monotonically increasing fencing token. Reuse worker heartbeats to renew it; compare the token and expected parent snapshot in the finalization transaction.

Queue before worker invocation. Acquire the lease and pin the latest snapshot immediately before dispatch, rather than pinning a stale snapshot when the user first requests work. A crashed writer's lease expires; a late callback from it cannot commit after another writer has acquired the space. Release only after checkpoint finalization or terminal failure.

Every agent turn is treated as a potential writer initially, even a reply turn. Downloads/previews/publications read immutable versions and do not acquire the writer lease. Avoid keeping a database transaction open during an agent run or upload.

Text-editor saves include the version/digest originally opened. After acquiring the lease, reject a conflicting change to that file rather than overwriting newer harness work. Editing a text artifact creates a new artifact version and working-file checkpoint; it never changes an existing version in place.

### Retention and purging

Keep the latest X working snapshots per space and the latest X versions per artifact, ordered by committed creation sequence. X is a positive configurable retention count; its initial default is an implementation detail to choose before the retention stage, not a phase-1 blocker. Apply the policy to actual S3 bytes as well as database visibility.

Always retain the current snapshot/version. Temporarily pin inputs of active runs and queued/in-progress publications; release pins on completion and reevaluate retention. A completed publication keeps its receipt, external ID/URL and minimal version metadata, but does not permanently pin old S3 bytes. Published destination content remains independent of source retention.

Purging is a retryable backend operation: mark eligible versions unavailable for new grants, wait for outstanding short-lived grants/active readers to expire, delete exact owned objects, then mark their content purged. Preserve minimal metadata where thread cards, provenance or publication receipts refer to the version. Show an explicit expired-version state instead of a broken preview. Pruning a snapshot archive does not delete independently stored artifact files.

## Run lifecycle

```mermaid
sequenceDiagram
    participant B as Backend
    participant D as PostgreSQL
    participant W as Fresh worker
    participant S as S3
    B->>D: Acquire space lease and pin current snapshot
    B->>W: Start run with backing, snapshot and fencing token
    W->>B: Request authorized snapshot read
    W->>S: Download and validate snapshot
    W->>W: Restore working files and run harness
    W->>B: Request server-assigned checkpoint upload
    W->>S: Upload new archive
    W->>B: Finalize checkpoint and declared outputs
    B->>S: Validate archive; store immutable artifact files
    B->>D: Commit snapshot pointer and versions if lease still valid
    B-->>W: Acknowledge durable checkpoint
    B->>D: Complete run and release lease
```

The empty initial snapshot skips download. An existing snapshot that cannot be restored fails preparation; starting empty would lose continuity. Storage grants bind an active job to its space, exact pinned input and server-assigned output keys. Use the worker-reachable S3 endpoint for run traffic and the browser-reachable endpoint for downloads.

Validate archives as untrusted data both when accepting and restoring: reject absolute/traversing paths, duplicate normalized entries, symlinks/hardlinks and special files; enforce decompressed limits and digests. Stream archive transfer and validation so compressed input cannot exhaust memory. The backend only materializes declared output files after verifying the archive.

Snapshot finalization is idempotent per job/checkpoint. Uploading alone does not advance the space. Write finalized metadata, artifact versions and thread-event intents transactionally; deliver thread events through a retryable mechanism. A retried callback returns the original result. Successful runs require durable file-save acknowledgement before their job becomes terminal.

Keep workspace preparation and result handling behind small backing strategies, wired in composition roots. Git strategies retain clone/branch/diff/PR behavior. Files strategies restore/checkpoint files and produce artifact results. Shared agent execution, questions, tools, logs, cost reporting and instruction handling remain common. This capability does not require a generalized storage plugin registry in the first release.

Introduce an explicit file-write policy rather than reusing `allowCode` for artifact generation. Plan/reply/summarise turns can save working notes; only output-producing actions register final artifacts. Audit prompts, `TaskTurnAction`, workflow/part completion, branch naming, job validation, failure messages and telemetry for assumptions that a build always produces a commit. A Files run identifies its base snapshot in the execution manifest.

ACP already accepts a local working directory, but required repository fields and harness startup flags still need auditing. Prove at least one real harness runs in a directory without `.git`; do not create a hidden Git repository as a workaround. Expand advertised harness support only after exercising it.

### Failure and recovery

| Situation | Required behavior |
| --- | --- |
| Restore failure or corrupt archive | Fail before running the harness; retain current snapshot |
| Agent failure with a live worker | Attempt a checkpoint of partial files; label it partial and produce no final artifact versions |
| Cooperative pause/cancel | Stop the harness, then allow a bounded checkpoint finalization before revoking storage access and making the job terminal |
| Worker killed or checkpoint upload fails | Retain previous snapshot; explain that this run's unsaved files are unavailable |
| Upload succeeded, database finalization failed | Retry the same checkpoint finalization; do not run the agent again to retry saving |
| Lost lease or stale parent snapshot | Reject advancement; preserve uploaded candidate for diagnosis, without automatic merge |
| Valid files, invalid artifact declaration | Retain checkpoint; fail the output action with a precise validation error |
| Harness resume state unavailable | Cold-start using saved space files and task context; report the cold start |
| Publication failure | Retain artifact and saved files; retry delivery independently |

Current terminal-job storage denial means graceful cancellation needs an explicit active-to-stopping checkpoint window. Hard cancellation cannot promise preservation. Document this difference in the UI.

## Preview contract

| Format | Initial behavior |
| --- | --- |
| Markdown, plain text, JSON, CSV | Sanitized Markdown or escaped text/table view, with bounded rendering |
| PNG, JPEG, GIF, WebP | Image preview |
| PDF | Browser/PDF viewer; download fallback |
| HTML with CSS, JavaScript and local assets | Interactive isolated preview of one selected entrypoint, including presentations |
| SVG | Sanitized/rasterized preview, or download until a safe renderer exists |
| Office files, archives, executables and other types | Download only; show that preview is unavailable |

HTML preview runs on a dedicated origin without application cookies, inside a sandboxed iframe with script execution enabled. Keep forms, popups and top navigation disabled. Do not combine script execution with same-origin privileges. Browser headers/CSP and MIME validation apply to all served assets, not just the entrypoint. The initial capability set supports local presentation controls, keyboard navigation and fullscreen initiated by the user; access to application APIs and external network services is excluded.

Serve HTML bundles through a version-scoped preview route so relative CSS/images resolve. Authorize a short-lived capability against the caller's access to that exact version and asset manifest, and pass it without app-origin session cookies. Normalize paths and refuse assets outside the manifest. Renew access after expiry through the authenticated application. Do not expose the working-files prefix.

Keep S3 private. Binary downloads use short-lived signed URLs issued after authorization; unsupported content gets attachment disposition. Public static hosting, custom domains and anonymous share links are separate features. `Publish` to a document destination does not mean making the artifact public.

Interactive JavaScript is required for the first release with previews. Before building the preview path, verify a representative locally bundled presentation in a browser, including inline scripts, module/asset loading, keyboard controls, fullscreen and capability expiry. Resolve required CORS/CSP behavior for the sandbox without handing it application credentials. Live APIs, CDN dependencies and general-purpose hosting remain outside this preview contract.

## Publishing contract

Add a narrow `ArtifactPublisher` capability to integration plugins, with domain request/result types in `@viberglass/types`. Provider implementations live in `packages/integrations/integration-<provider>` and are selected by registry capability. Generic backend services never branch on provider IDs. Use `viberglass.plugins.json` and generated registrations when introducing packages.

The capability declares accepted source formats and supports target validation, conversion preflight and publication. Start with creating a new page/document under an explicitly selected parent. An artifact's new version may create another external document; updating an existing document and resolving external edits are later behavior.

Reuse existing connection records, encrypted secrets and credential selection. Publisher connections need an appropriate category/slot rather than masquerading as trackers or SCM. OAuth consent, refresh and revocation for document destinations are connector concerns; the harness login-job mechanism is not automatically a connector OAuth implementation.

The backend resolves credentials and invokes the publisher against immutable artifact bytes. The harness receives no publishing credential by default. A person presses Publish; an agent cannot trigger that external side effect through its output manifest.

A publication record contains artifact version, connection, normalized target, requesting user, idempotency key, status, external ID/URL and safe error details. Proposed states are `queued`, `publishing`, `succeeded`, `failed`, and `unknown` when the provider may have accepted a request but its result is unavailable. Serialize the same version/connection/target and return the existing publication for repeat clicks.

Use a durable backend execution path so process restarts can resume delivery. Honor provider retry delays for known retryable failures. After an ambiguous create timeout, reconcile through provider metadata where supported or ask the person to resolve it; never blindly create again. Database idempotency alone cannot guarantee exactly-once creation in an external API.

Publishing permission: maintainers/admins and task owners who already have access to the space may publish. Viewers cannot mutate; guests cannot publish initially. Connection setup remains administrator plumbing, destination defaults are maintainer settings. Enforce this on the server and keep the chosen version/target explicit in the activity record.

### First destination options

| Destination | Feasible starting point | Still needs a real trial |
| --- | --- | --- |
| Notion | Create a page from Markdown under a connected parent; current API supports Markdown create/update | Parent access, pinned API/SDK version, supported formatting, attachment upload, size limits and ambiguous-create recovery |
| Google Docs | Drive import/conversion of supported document sources, or Docs create plus batch content updates | OAuth/refresh, folder access, conversion fidelity, image handling, import-format discovery and ambiguous-create recovery |

Notion supports creating, reading and updating Markdown through its page endpoints, which makes it a plausible first adapter. See [Notion's Markdown API guide](https://developers.notion.com/guides/data-apis/working-with-markdown-content). This does not establish that arbitrary HTML bundles or every Markdown extension preserve their formatting.

Google Drive documents conversion on upload to Google document types; Google Docs separately provides document creation and batch editing. Choose one path after a formatting trial. See [Drive upload/conversion](https://developers.google.com/workspace/drive/api/guides/manage-uploads) and [Docs requests and responses](https://developers.google.com/workspace/docs/api/concepts/request-response).

Preflight refuses unsupported formats or lists intentional conversion loss. Transfer embedded assets into durable destination storage, or reject that export initially. Expiring private S3 URLs cannot serve as permanent images in a published document.

## Implementation stages

Each stage is a separately reviewable change. Phase 1 is implemented; the remaining stages and their checks are planned.

| Stage | Scope | Exit criteria |
| --- | --- | --- |
| 1. Backing and product contract | ADR amendment, explicit backing migration/types, creation/setup/settings/readiness, task completion rules | Existing spaces remain Git; Files space needs no SCM; storage availability is surfaced; unsupported runs are clearly blocked until stage 2 |
| 2. Persistent Files runs | Backing strategies, snapshot/lease records, scoped transfer/finalization, turn/prompt/result changes and cancellation behavior | A fresh worker runs without Git; a second fresh worker sees created/edited/deleted files; concurrent writers queue; failed persistence cannot report success |
| 3. Artifacts and previews | Output manifest, immutable versions, thread cards, Files/Artifacts views, upload/download, Markdown/plain-text editor, interactive isolated preview and retention purging | A task produces and revises Markdown and an interactive presentation; retained previews remain stable; text saves detect conflicts; relative scripts/assets work; versions beyond X are purged without breaking active work or publication receipts |
| 4. First publisher | Capability, one chosen provider package, credentials, target preflight, durable publication operation and activity | One version is published to a real test destination; repeat clicks/retries do not duplicate known successes; failure leaves the artifact usable; ambiguous results are visible |
| 5. Second publisher | Second provider using the same capability and operation model | Adding it needs no provider branches in generic services; formatting and auth behavior are verified against its real API |

Stage 2 should prove Docker plus Kubernetes when supported by the target deployment; other invokers must either accept the backing contract or reject Files clearly. Include scheduled jobs in the same space lease, or explicitly withhold Files schedules until their pipeline is adapted. Do not claim every harness/compute combination works from one smoke test.

### Phase 1 scope

The eight product decisions are settled. Phase 1 delivers the accepted ADR, `backingKind` migration/shared contracts, Files creation in normal and first-space setup, backing-aware settings/readiness and explicit Files task completion. Existing spaces default to Git. Files creation needs no repository, while runs remain clearly unavailable until persistent execution is delivered in phase 2.

The exact retention count and preview hostname/deployment wiring can be chosen in their implementation stages. They do not block the phase-1 migration or creation flow. Keep the accepted presentation, retention and text-editor requirements visible in the contracts and follow-up stages.

Validation for the relevant stage:

- Migration/API tests: backing backfill, invalid backing/SCM combinations, Files readiness, visibility and mutating-role guards.
- Worker orchestration tests: preparation without Git, cold/resumed sessions, file-write policy, finalization ordering, partial checkpoints, and Git behavior preserved.
- PostgreSQL/S3-compatible integration smoke: create → fresh-run restore → edit/delete → checkpoint → fresh-run restore; lease expiry/fencing and retry after uploaded-but-uncommitted state.
- Archive/preview tests: traversal/links/duplicates/oversize archives, forged artifact IDs, digests, expired grants, asset-path escape, private-space isolation, presentation navigation and script/module loading without application access.
- Retention/editor tests: keep exactly X eligible versions, protect active inputs, retry S3 deletion, preserve publication receipts after purge, and reject stale text saves.
- Publication tests: capability selection, unsupported formats, repeated clicks, process restart, revoked credentials, known failures and ambiguous external create responses.
- Real harness smoke in a non-Git directory; agent-browser verification of space creation, interactive presentation preview/revision, Files upload, Markdown/plain-text editing and publication progress/error states, including screenshots.

Before implementation, identify the project's current commands and extend existing relevant suites. Run the applicable unit/integration/build checks for each stage; planning-only changes do not warrant running application tests.

Operate with a private bucket and configured browser/worker/preview endpoints. Track snapshot/version bytes, save latency, restore errors, lease contention, purge failures and publication results. Clean up abandoned staging objects after a retry grace period, and automatically purge finalized history beyond X using the retention policy above. Retention must ship with versioned previews, before enabling unbounded recurring workloads.

## Phase 1 implementation and verification

- Migration `118_space_backing` adds an explicit backing with Git as the default for every existing space, including incomplete repository setup. Database constraints/triggers prohibit backing conversion and repository configuration on Files spaces. Rollback refuses to reinterpret existing Files spaces as Git.
- Normal creation and first-space setup offer Git repository or Files. Files setup skips repository credentials and runner startup, recognizes the created space on reload, and completes without a runner. Trackers remain optional.
- Files settings identify the fixed backing and omit the Repository tab; direct repository-setting links redirect to General. Storage readiness distinguishes missing, invalid and configured storage without claiming a successful connection check.
- Files tasks retain discussion and manual Markdown plan editing. Their page hides agent/build actions and uses the existing status/activity flow for explicit Mark done and Reopen task.
- Task turns refuse Files execution before posting agent requests, creating sessions or resolving build parts. Shared run preparation also rejects Files backing, covering scheduled dispatch. Persistent execution remains unavailable until phase 2.
- Space route handlers and project persistence helpers were extracted into smaller files while preserving the existing API and transaction behavior.

Validation on the worktree: **1,465 backend unit tests**, **435 frontend unit tests**, and **five PostgreSQL migration integration tests** passed. Shared types and both applications built successfully; backend TypeScript checking and lint on changed backend production files passed. The complete migration chain also applied to a separate disposable PostgreSQL database.

Real API verification covered creation, first-space setup, readiness, immutable backing, SCM rejection, task completion/reopening and the execution refusal. Authenticated agent-browser walkthroughs and reviewed screenshots covered both creation flows, Files settings and task completion/reopening. A dedicated browser session was used after the shared verification session changed pages.

Phase 1 supplies the product and backing foundation. Space-file upload/editing, S3 snapshots, artifact versions, interactive previews, retention purging and publishing remain in their planned stages; no Files run is advertised as usable yet.

## Phase 2 implementation and verification

Files spaces now run agents. Every turn in a Files space restores the space's latest files on fresh compute, runs the harness in a directory without Git, and saves the result as a new snapshot before the run reports.

- Migration `119_space_files` adds `space_file_snapshots` (immutable versions with digest, size, manifest and change counts), `space_file_state` (current snapshot pointer and the writer lease with its fencing token) and `space_file_runs` (each Files job's place in the queue, pinned base snapshot and pre-assigned checkpoint id).
- One run changes a space's files at a time. A run that finds the space busy stays `queued` with "Waiting for another run to save this space" and starts, oldest first, when the holder saves or ends. The lease is released at checkpoint, so the next turn doesn't wait for the previous job's result callback. Heartbeats renew the lease; a lost worker's lease expires after ten minutes. A sweeper starts waiting runs after restarts and releases runs of jobs that ended without releasing.
- Workers get presigned URLs for exactly two objects: the pinned base archive (read) and their own checkpoint (write). This works for every worker type, not only Kubernetes. `S3_WORKER_ENDPOINT` signs URLs for an address workers can reach when it differs from the backend's.
- The checkpoint callback streams the uploaded archive, rejects unsafe paths, links, special files, duplicates and oversize content, checks the reported digest, and commits only while the run holds the lease and the space is still on the run's base snapshot. A repeated checkpoint returns the first result; a refused one stays in storage for diagnosis.
- A failed agent run saves a partial snapshot, then fails. A save or restore failure fails the run with `FILES_SAVE_FAILED` or `FILES_RESTORE_FAILED`, and the space keeps its earlier files. Cancelling a run saves nothing and frees the space at once.
- Platform files (plan, summary, PR metadata, materialized instruction files) and dependency caches are never saved. Instruction files the space already had are restored to their own content before saving.
- Task turns ask, plan, reply and summarise in Files spaces; building a pull request is refused. Schedules and Lambda runners are refused in Files spaces. Migration `120_files_turn_prompt` tells the agent that its working directory is the space's shared files and that changes are kept.
- The thread shows each turn's saved files ("Saved files · 1 added, 1 removed · 1 file"), partial saves and the waiting state. First-run setup for a Files space now prepares an agent, as Git setup does.
- The dev stack runs MinIO as the `storage` service, and the backend uses it for Files snapshots, ticket media and plan documents.

Validation: 1,535 backend unit tests, 248 worker tests, 476 frontend tests and six PostgreSQL integration tests for leasing, fencing, stale bases, idempotent saves and release passed. On the dev stack with Docker workers, a fake agent proved restore and append across fresh containers, queuing of two tasks in one space with the correct snapshot chain, partial saves on failure, and release on cancel. The real OpenCode harness created and deleted files in a directory without Git, then edited the restored file on a fresh worker.

Not yet verified at the time: Kubernetes and ECS workers running Files runs, and a cooperative checkpoint when a run is cancelled (added on 2026-10-13, see phase 3). Retention of old snapshots shipped with stage 3.

## Phase 3 implementation and verification

Files spaces now produce artifacts: named deliverables with immutable versions that preview in the app, including interactive presentations.

- In a Files space the build action is "Create artifact", or "Revise artifact" once the task has one. The agent creates or revises the deliverable in the space's files and declares it in `.viberglass/artifacts.json` (title, entrypoint, files and folders, and an `artifactId` to revise). The worker sends the declaration with its checkpoint and never saves the `.viberglass/` folder. The prompt lists the task's artifacts so revisions reuse their ids. Artifact runs are reply jobs, so they don't put the task in review.
- Migration `121_artifacts` adds `artifacts` and `artifact_versions`. The backend checks a declaration against the saved files and the task (an id from another task is refused), copies each declared file into its own object under the version, and commits the versions with the snapshot in one transaction. Version and new-artifact ids derive from the checkpoint, so a repeated checkpoint can't duplicate them. An artifact run with a missing or invalid declaration keeps its files and fails with `ARTIFACT_INVALID` and a readable reason.
- The Files view lists the working files and lets people upload, download, delete and create files, and edit Markdown and plain text up to 1 MiB. Each change holds the space like a run (`lease_operation_id`), so it's refused while a run is changing the files, and a save carries the hash of the file as opened, so an intervening change is refused with the person's text kept. Changing a file that belongs to an artifact's current version makes that artifact's next version.
- Previews: Markdown, text, JSON and CSV render in the app. HTML, images, PDF and SVG load in an iframe from the preview origin, a separate server on its own host (`PREVIEW_PORT`, `PREVIEW_PUBLIC_URL`; `127.0.0.1:8890` in dev, so the app's localhost cookies never reach it). A signed link valid for an hour names one version, relative paths resolve under it, and only the version's declared files exist. Responses carry a CSP sandbox (scripts allowed; no same origin, forms or top-level navigation), `connect-src 'self'`, `frame-ancestors` for the app only and CORS for the opaque origin. Bundles download as a zip.
- Retention keeps the latest `SPACE_FILES_KEEP_SNAPSHOTS` (20) snapshots per space and `ARTIFACT_KEEP_VERSIONS` (10) versions per artifact. It never retires a current snapshot or version or a live run's starting snapshot. Retired items stop being served at once; their objects are deleted after 15 minutes and retried on failure. Rows stay, and the app shows an expired version as "no longer kept".
- Migration `123_files_change_between_turns` tells the agent that people and other tasks change the files between its turns, so it rereads a file before relying on it.

Validation: 1,576 backend unit tests, 252 worker tests, 496 frontend tests and 13 PostgreSQL integration tests passed. End to end on the dev stack, the OpenCode harness (OpenCode Go, `deepseek-v4.1-flash`) created an HTML presentation of three files with an ES module script, which previewed with working click and arrow navigation, a slide counter and full screen. A probe uploaded as the deck's script confirmed an opaque origin, no cookies, storage, parent access, app API or internet, and only its own assets. OpenCode then revised the same artifact to version 3 and created a Markdown brief. Editing the brief in the Files view made new person versions, and a stale save was refused with the text kept. A retention sweep with small limits retired and deleted the oldest versions and snapshots, kept the current files, and a later run restored them.

Known gaps closed on 2026-10-13:

- The suggestion buttons send what's written in the composer, so a request typed there goes with "Create artifact" or "Revise artifact".
- Uploads, edits and deletions made while a run holds the space wait in `space_file_changes` (migration `124_space_file_changes`), with their content staged under `spaces/{id}/changes/`. They're saved oldest first as soon as the space is free, before the next waiting run starts. A text save the run made stale fails then and keeps its text, which the Files view offers to download until someone dismisses it.
- Objects nothing refers to (refused or abandoned run uploads, staged content of changes that were never recorded) are deleted a day after they were written, by the retention sweep.
- Cancelling a run gives its worker a minute to save what it had: the space's lease is cut to 60 seconds instead of released, the worker saves a partial snapshot on SIGTERM, and the space is freed when it saves or the minute runs out. Kubernetes Jobs and ECS tasks now get 60 seconds after SIGTERM, Docker 20. Verified on the dev stack with Docker workers.
- The preview origin is wired into the one-server compose install (Caddy serves a second hostname), the Helm chart (its own ingress host) and the AWS stack (`previewDomain`). Worker media and session links are now signed for `S3_WORKER_ENDPOINT` too.

Still to verify on real deployments: Kubernetes and ECS Files runs, the preview host on each install path, and a stopped worker saving within its grace period there. Publishing is the next stage.

## Accepted decisions and remaining details

| Decision | Accepted direction (2026-10-12) | Implementation consequence |
| --- | --- | --- |
| Do tasks share all space files? | Yes, with one writer per space | Per-task isolation would change restore and promotion semantics |
| First preview scope | Interactive HTML/CSS/JavaScript, especially presentations, plus documents/images/PDF | Dedicated preview origin, sandbox, local dependencies and browser verification |
| First publisher | Notion Markdown, after S3-only delivery | A narrow document format makes the first export verifiable |
| First publication behavior | Create a new external document; no automatic updates | Updating needs ownership and conflict policy for remote edits |
| Who publishes? | Admins/maintainers and the task owner | New permission must fit existing roles and private-space access |
| When is a Files task done? | Explicit Mark done | A save or successful publication may be only one deliverable |
| Storage budgets and history | Keep the latest X versions and automatically purge older content | Configurable count, active-input protection, retryable S3 cleanup and retained receipts |
| Input management | List/upload/download; in-app editor only for Markdown/plain text | Harnesses edit other formats; text saves serialize and detect conflicts |

Remaining engineering details are the initial value of X, numeric file/storage budgets and deployment configuration for the preview origin. The plan's suggested byte limits remain starting assumptions. Set these during the relevant implementation stages without reopening the accepted product scope.

The first execution milestone is a thin complete path: create Files space → produce Markdown → save to S3 → run again on fresh compute → revise. The first artifact-preview release also includes interactive presentations, Markdown/plain-text editing and automatic version purging. Publishing follows once that path is proven.
