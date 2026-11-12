# Apps

App spaces build internal apps with an agent, and Viberglass hosts them: each app runs in a container of its own at `<name>.<apps domain>`, behind Viberglass sign-in, with its SQLite database copied continuously to object storage. This page covers what an installation needs for that, and how apps run. For using apps, see [Apps](../user/apps.md) in the user guide.

## What App spaces need

Settings → Apps lists what's still missing. App spaces are offered when people create a space once all four are there:

- An apps domain: `APPS_DOMAIN`, a wildcard domain apps are served under, such as `apps.viberglass.example.com`.
- Object storage, where app data, backups and releases are kept (`S3_BUCKET`).
- Somewhere to run apps. Docker always can. On Kubernetes the chart sets it up when `apps.domain` is set, and on AWS the platform stack does when `appsDomain` is set.
- An App home, chosen on the same page.

## The App home

Each App space's code lives in a private repository that Viberglass creates. The App home says where: under Settings → Apps, choose a code host connection that can create repositories, the access token (the one that creates the repositories and that agents push to them with) and the owner, the account or organisation the repositories belong to. Save checks that the token can create repositories there. GitHub is the code host that can; a fine-grained token needs Administration, Contents and Pull requests write access for the owner.

A new App space's repository is named after the space. If a repository with that name exists already, creating the space is refused; make that repository's Git space an App space instead. Spaces created earlier keep their repositories when the App home changes. Remove App home stops new App spaces without touching existing ones.

## The apps domain

Every app and preview gets a host name under the apps domain, so it needs a wildcard DNS record pointing at Viberglass, and HTTPS on a server. How to set it up depends on where Viberglass runs:

- Docker on your machine: `apps.localhost`, on port 8891. See [Apps on Docker](install-docker.md#apps).
- Docker on a server: `VIBERGLASS_APPS_DOMAIN`, with Caddy getting a certificate for each app as it's first opened, or your own proxy with a wildcard certificate. See [On a server](install-docker.md#on-a-server).
- Kubernetes: the chart's `apps.domain` and a wildcard certificate in `ingress.tls`. See [Apps on Kubernetes](install-kubernetes.md#5-configure-dns-tls-and-registry-access).
- AWS: `appsDomain` in the platform stack. See [Apps on AWS](install-aws.md#apps).

Use a domain that only apps use.

## How an app runs

When a change is made live, or the repository's main branch moves on GitHub, Viberglass builds a release. Builds run on a runner Viberglass creates for itself on the default worker target, in the `viberglass-app-builder-node` image; they don't use the space's agents or their credentials. The branch is checked every minute (`APP_RELEASE_POLL_INTERVAL_MS`). A release is the built app as an archive in object storage.

Going live stops the running release, backs up its data and starts the new release. The host has 5 minutes (`APPS_START_TIMEOUT_MS`) to get it running, which covers scheduling the pod, attaching its volumes and pulling its image; from then on the release has 2 minutes (`APPS_HEALTH_TIMEOUT_MS`) to answer `/healthz`. Previews start the same way. If it doesn't, the backup is restored and the previous release starts again. Releases never overlap, because an app has one SQLite database and one copy of it in storage.

Releases run in the `viberglass-app-runtime-node` image. It downloads the release, restores the database from object storage, and runs the app with [Litestream](https://litestream.io) copying every change back, about once a second. A replaced container, pod or task restores its data from there. Both images are published next to the worker images, with the same registry and tag (`VIBERATOR_WORKER_REGISTRY`, `VIBERATOR_WORKER_IMAGE_TAG`); `APP_BUILDER_IMAGE` and `APP_RUNTIME_IMAGE` name others.

Each app gets storage credentials that reach only its own data. Previews get read-only ones for the live data they start from, and keep nothing.

## Resources

| Target | Each app and preview |
|---|---|
| Docker | 512 MB and 1 CPU (`APPS_MEMORY_MB`, `APPS_CPUS`), a read-only root filesystem, a data volume and a network of its own. |
| Kubernetes | The same, as one Pod with a 1 GiB data volume (`APPS_DATA_SIZE`) and a 1 GiB release volume (`APPS_RELEASE_SIZE`), within the apps namespace's quota. |
| AWS | 0.25 vCPU and 512 MB on Fargate unless `APPS_CPUS` and `APPS_MEMORY_MB` say otherwise. |

## Isolation

An app can reach services on the internet, its own data in object storage, and nothing else: not the backend, the database, the workers, other apps or the private network. Only the backend's app gateway opens connections to apps. How that's enforced depends on the target:

- Docker: each app has a network of its own from `APPS_NETWORK_POOL`, the backend refuses connections from that pool, and host firewall rules drop the rest. The rules are a step you take; see [Apps on Docker](install-docker.md#apps).
- Kubernetes: apps run in their own namespace under the `restricted` Pod Security level, with NetworkPolicies. See [Apps on Kubernetes](install-kubernetes.md#5-configure-dns-tls-and-registry-access).
- AWS: apps share a security group that only the backend can reach, and each App space has its own IAM roles. See [Apps on AWS](install-aws.md#apps).

## Previews

A preview runs like an app, with a copy of the live data that it throws away. Previews turn off at 03:00 UTC (`APPS_PREVIEW_OFF_HOUR`, an hour from 0 to 23) and after 4 hours without being opened (`APPS_PREVIEW_IDLE_HOURS`); Try it on the task turns one on again.

## Storage and retention

An App space's objects are under `spaces/<space id>/` in the bucket: `app-data/` is the live database's Litestream copy, `backups/` the data backups, `releases/` the built releases. Apps can't write to the backups.

Object storage keeps what's needed to roll an app back:

- The releases of the 5 releases that went live most recently (`APPS_KEEP_LIVE_RELEASES`), plus the current one.
- Data backups from the last 30 days (`APPS_KEEP_BACKUP_DAYS`), and the newest backup of each kept release's data.
- Builds that never went live, including previews' builds once no preview uses them, for 7 days (`APPS_UNUSED_BUILD_DAYS`).

The release list on the App page still shows a removed release, but it can't be made live again. Back up the bucket with the database; see [Upgrades and backups](upgrades-and-backups.md#apps).

## Archive, delete and stop hosting

- Archiving an App space stops its app for good and takes a last backup.
- Deleting it removes the app's containers, volumes, releases, data and backups, and on AWS its IAM roles. Its repository is archived on the code host, not deleted, with a description saying so. If that fails, the space is deleted anyway and the warning says so.
- Stop hosting the app, in the space's settings, does what archiving does and turns the space into a Git space on the same repository. A last copy of the data is kept for `APPS_KEEP_BACKUP_DAYS`, to download or to start from when the space becomes an App space again.

## Environment

These go on the backend. The install guides set the ones their target needs.

| Variable | Default | |
|---|---|---|
| `APPS_DOMAIN` | | The wildcard domain apps are served under. Empty turns App spaces off. |
| `APPS_PUBLIC_URL` | `https://<APPS_DOMAIN>` | The scheme and port apps are opened at, such as `http://apps.localhost:8891`. |
| `APPS_PORT` | | The gateway's port, 8891 in every install. |
| `APPS_TRUST_PROXY` | | `true` behind a proxy that appends the client's address to `X-Forwarded-For`. |
| `APPS_MEMORY_MB`, `APPS_CPUS` | 512, 1 (0.25 on AWS) | Each app's and preview's memory and CPUs. |
| `APPS_START_TIMEOUT_MS` | 300000 | How long the host has to get an app or preview running, before its health check's time starts. |
| `APPS_HEALTH_TIMEOUT_MS` | 120000 | How long a new release has to answer its health check. |
| `APPS_PREVIEW_OFF_HOUR`, `APPS_PREVIEW_IDLE_HOURS` | 3, 4 | When previews turn off. |
| `APPS_KEEP_PREVIEWS_ON` | false | `true` keeps previews running until their change ends, for an instance that shows previews to people who can't start them, such as a demo. Chart value `apps.keepPreviewsOn`. |
| `APPS_KEEP_LIVE_RELEASES`, `APPS_KEEP_BACKUP_DAYS`, `APPS_UNUSED_BUILD_DAYS` | 5, 30, 7 | Retention. |
| `APPS_DATA_ENDPOINT` | `S3_ENDPOINT` | The object storage address apps use, when it isn't the backend's. |
| `APPS_DATA_ROLE_ARN`, `APPS_DATA_CREDENTIAL_SECONDS` | | On Docker and Kubernetes with AWS S3: the role apps' credentials come from, and how long they last. |
| `APPS_RESTART_HOUR` | 3 | The hour (UTC) apps restart for new storage credentials, when they can wait for it. |
| `APPS_NETWORK_POOL` | `10.250.0.0/16` | Docker: the range app networks come from. The firewall rules name it too. |
| `APP_BUILDER_IMAGE`, `APP_RUNTIME_IMAGE` | published images | Images for building and running releases. |
