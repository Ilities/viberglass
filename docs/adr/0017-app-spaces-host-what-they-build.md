# ADR 0017: App spaces host the software they build

- Status: Accepted
- Date: 2026-11-03
- Decider: Jussi Hallila
- Amends: [ADR 0005](./0005-roles-and-space-visibility.md) (a fifth workspace role), [ADR 0008](./0008-tasks-are-conversations.md) (deploying is outside Viberglass), [ADR 0016](./0016-file-backed-spaces-and-artifacts.md) (a third space backing)

## Context

Agents can now build small, bespoke business software, such as a back-office tool for tracking laptops, well enough to replace a SaaS subscription. The person who asks for it can't deploy it, keep it running, back up its data or manage who may use it. Viberglass stops at a merged pull request (ADR 0008), so that software never reaches its users.

Hosting arbitrary software means building a general-purpose platform, which a self-hosted product (ADR 0002) can't take on. Comparable products (Base44, Lovable, Replit) all fix the runtime, database and sign-in for the apps they generate.

## Decision

- A space can be an App space. Its purpose is one app, which Viberglass builds, runs, backs up and controls access to. An App space is backed by a private git repository that Viberglass creates in the workspace's App home: a code host connection and owner an admin sets once. Its people never deal with git. Without an App home, App spaces aren't offered.
- Apps follow a fixed contract, and software that doesn't fit isn't hosted:
  - Node only.
  - It listens on `$PORT` and answers `/healthz`.
  - Its data lives in one SQLite database under `/data`, and it runs its own migrations at startup.
  - It reads app settings from the environment.
  - It has no sign-in of its own.
  
  A built-in skill teaches agents the contract in App spaces.
- A release is a prebuilt bundle (the built app and its dependencies, as an immutable tarball in the platform's object storage) that runs on a Viberglass runtime image. There are no per-app container images, so no registry or image builder is needed. Builds are ordinary worker jobs on the existing compute.
- An app runs as a single instance on Docker, ECS or Kubernetes. SQLite is replicated continuously to object storage with Litestream and restored when the app starts. Stopping an app must finish replication before the container exits.
- Tasks in an App space produce a change, not a pull request. "Try it" opens a preview: a temporary copy of the app built from the change's branch, starting from a copy of the live data. "Make it live" merges the change. The merge builds a release, takes a data backup and switches traffic once the health check passes. If the health check fails, the previous release keeps serving. The space's maintainers and the task's owner can make a change live, and only after its latest commit has a preview. Merges made directly on the code host build releases too.
- Maintainers can roll back to an earlier release, either the code alone or the code and its data backup. Data backups are taken before every release and on demand, kept under a configurable retention, and only maintainers can restore or download them.
- Apps are internal. Every request goes through a gateway on `<app>.apps.<domain>` that requires Viberglass sign-in. The gateway uses its own host-only cookie, which never reaches the app, and passes the person's identity to the app in headers. Roles inside apps are left out until real apps show what's needed.
- App user is a fifth workspace role. App users see no spaces, tasks or settings, only a list of the apps they can open. An app's access list is the space's members plus anyone a maintainer adds.
- App settings are plain or secret values that maintainers set, passed to the app as environment variables. Secret values never reach the agent, and previews get them only when a maintainer allows it.
  - Apps can reach the internet, but not the platform's backend, database, object storage, workers or the cloud metadata endpoint.
  - Apps can't reach each other.
- An app is on or off. Only the space's maintainers and the space's schedules turn it on or off; schedules use the existing schedule engine with a new start/stop action. People who open an app that's off see who can turn it on.
- By default the agent sees only the schema of an app's data. A maintainer can give one turn a fresh data backup to read. The agent never writes to live data: data fixes are code that goes through a change, a preview and a release.
- Archiving an App space turns its app off and keeps its data. Deleting it (workspace admins only) removes the app's data and backups and archives its repository on the code host.

## Considered options

- Hosting apps from any Git space when the repository contains a manifest. Rejected: the person who needs the app shouldn't have to know their space is a git repository.
- Per-app container images built from agent-written Dockerfiles. Rejected for now: every deployment target would need a registry and an unprivileged image builder, and agent-written Dockerfiles are a large surface to review. Bundles can later be turned into images by appending a layer to the runtime image, without changing the app contract.
- Viberglass hosting the git repositories itself. Rejected: it means building git hosting and giving up the code host's pull requests.
- Idle sleep with wake-on-request. Deferred: apps are on or off by a person or a schedule.

## Consequences

- ADR 0005 gains the App user role. Every policy decision has to deny App users by default, as it does for guests and viewers.
- ADR 0008's "Deploying is outside Viberglass" no longer applies to App spaces. There, a task is done when its change is made live, which is still a merge. Git spaces are unchanged.
- ADR 0016's backing choice gains App next to Git repository and Files.
- Whoever hosts the instance configures a wildcard apps domain, the same way as the preview domain: the Pulumi stack on AWS, a wildcard Ingress host on Kubernetes, and `*.apps.localhost` on `docker compose`. Without it, App spaces aren't offered.
- Because an app is one SQLite writer, it can't run more than one instance. Software that outgrows that needs a later Postgres option.
- Left out for now: Postgres, more than one instance, scheduled jobs and inbound webhooks in apps, outbound email, public apps, roles inside apps, idle sleep, and repositories on code hosts other than those with a repository creator.
