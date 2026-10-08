# Kubernetes deployment and operations

The chart is in [`infra/kubernetes/chart`](../infra/kubernetes/chart). It deploys the application into an existing Kubernetes cluster. The OVHcloud Pulumi stack is a subsequent work package; this chart does not create cloud resources.

For the complete first-install procedure, use [Install on Kubernetes](guide/admin/install-kubernetes.md). It includes namespace ownership, Secret creation, production values, DNS/TLS, private registries, first-run setup and verification. Start from the [production values example](../infra/kubernetes/chart/values-production.example.yaml).

## Production prerequisites

Provision a cluster, PostgreSQL, S3-compatible storage, an ingress controller, DNS/TLS, and optionally SMTP. Use a NetworkPolicy-capable CNI. The frontend is a static Vite build served by nginx, which proxies `/api` to the backend. The chart sets `PLATFORM_PUBLIC_API_URL` for browser media links and keeps `PLATFORM_API_URL` internal for worker callbacks. No separate browser API hostname is needed.

The image publishing workflows target GHCR for linux/amd64 and linux/arm64 on relevant changes to `main` and on each release:

| Image | Repository |
| --- | --- |
| Backend | `ghcr.io/ilities/viberglass-backend` |
| Frontend | `ghcr.io/ilities/viberglass-frontend` |
| Workers | `ghcr.io/ilities/viberator-worker-<agent>` (the agent catalog's names) |

Successful publishing jobs tag images with the release, the commit SHA and `latest`. Verify that the backend, frontend and chosen workers all exist under the same tag, and pin it rather than following `latest`. Unpublished changes require your own matching builds. The chart's default worker repositories follow the agent catalog; `workers.registry` and `workers.imageTag` resolve them, and explicit runner images override the catalog default.

For your own registry, follow the [build and push commands](guide/admin/install-kubernetes.md#build-your-own-images) from the same source revision.

## Secrets and values

Create the app namespace and worker namespace before loading secrets. Supply:

| Namespace | Secret | Keys |
| --- | --- | --- |
| App | `viberglass-app` | `DB_PASSWORD`, `SECRETS_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` |
| App | `viberglass-storage` | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_SESSION_TOKEN` |

Workers do not receive S3 keys. The backend creates an immutable callback-token Secret per run, mounts it read-only, and gives it a Job owner reference so Job deletion/TTL cleanup also removes it. The backend needs namespaced create/get/delete permissions on these Secrets and get/list access to worker Pods and events; workers still have no Kubernetes API token or permissions.

For authenticated worker telemetry, `workers.envSecret` optionally names a worker-namespace Secret containing `OTEL_EXPORTER_OTLP_HEADERS`. Only that key is referenced; arbitrary environment values and storage keys are not imported.

Generate independent strong encryption keys and retain them securely. Secrets must be supplied out of band or through your secret manager. The chart never generates production credentials. An existing worker Namespace must have Helm ownership annotations for the release, since the chart manages it; create/adopt only a namespace dedicated to this installation. The local installer handles ownership on namespaces it creates.

Copy the [production values example](../infra/kubernetes/chart/values-production.example.yaml) and replace its image tags, hosts, signing region and ingress class. The [installation guide](guide/admin/install-kubernetes.md#4-configure-the-installation) explains each setting. The commands below assume you saved it as `production-values.yaml`.

The published images are public and need no pull Secret. For a private registry, create pull Secrets independently in both namespaces: `imagePullSecrets` serves app and migration Pods, and `workers.imagePullSecrets` names Secrets in the worker namespace. For private Git, private object storage, or internal telemetry, add allowed destinations to `networkPolicy.workerExtraEgress` using Kubernetes NetworkPolicy egress rules. Public HTTP(S)/SSH and cluster DNS/backend storage are allowed by default. Service endpoints must be reachable from nodes/Pods, and database network access must be allowed by the provider.

```bash
helm upgrade --install viberglass infra/kubernetes/chart --namespace viberglass -f production-values.yaml --wait --wait-for-jobs --timeout 10m
```

A regular migration Job runs on each Helm revision. Backend init waits for every numbered migration shipped in the backend image to appear in `kysely_migration`, on both fresh installs and upgrades. This avoids hook ordering deadlocks on a fresh database. Review migration logs on errors. The gate reads migration names from the image; there is no `migration.marker` value to maintain. Existing backend Pods can remain running during upgrades, so future migrations must support rolling deployments.

Embedded PostgreSQL/MinIO are available in `values-local.yaml` for development. They are single instance services, without automated backups or high availability. External object storage buckets must already exist; bucket creation runs only for the embedded MinIO option.

## Upgrade, rollback and capacity

- Back up the database and encryption keys before migrations. Publish immutable app/worker image tags; update values and run Helm upgrade with `--wait --wait-for-jobs`.
- Existing worker Jobs retain their image and run during app rolling updates. Keep the callback service stable and allow sufficient termination time. Maintain bootstrap/callback compatibility between deployed versions.
- Helm rollback can restore a Deployment, **not reverse database migrations**. Review schema compatibility before rollback; restore a backup when rollback requires it.
- Adjust `workers.quota` and per-Clanker resources together. Quotas do not add nodes; pending Pods need schedulable node capacity. Production nodes must have room for the app, system workloads, and concurrent Jobs.
- The supported deployment uses `backend.replicas: 1`; sweepers and dispatch coordination run in that process.
- Use ingress annotations/TLS resources appropriate to your installed controller. Certificate issuance/renewal belongs to the cluster operator; the chart references an existing TLS Secret.

Kubernetes runs use a minute-by-minute heartbeat, and orphan detection measures inactivity rather than total runtime. Kubernetes still enforces the runner's Job deadline. Pod state and events appear in the existing run's worker log. Image-pull, container configuration, scheduling and Pod admission failures are reconciled after a two-minute startup grace period; Job failures retain their reported reason. Diagnostics do not count as worker heartbeats.

When upgrading an earlier installation, deploy the backend and worker images from the same revision. Older Kubernetes workers expect shared S3 credentials. After the new workers are deployed, remove obsolete worker-namespace storage Secrets through your normal secret-management process. The application namespace still needs its storage credentials.

## Backups and restore

For managed PostgreSQL, enable the provider's backups/PITR and perform a test restore to a separate database. For local PostgreSQL:

```bash
kubectl -n viberglass exec viberglass-postgres-0 -- pg_dump -U viberglass -d viberglass -Fc > viberglass.dump
```

Store the dump together with securely backed-up encryption keys and a snapshot/copy of the object-storage bucket (instructions, media, documents, session archives). Restore into a fresh database with the same encryption keys and matching objects. Point the backend at the restored database/bucket and validate login, secret resolution, document downloads, and a resumed session before replacing production. Bucket lifecycle policies must not delete active session archives prematurely.

## Diagnostics and cleanup

```bash
kubectl -n viberglass get pods,jobs,pvc
kubectl -n viberglass logs deployment/viberglass-backend
kubectl -n viberglass logs job/viberglass-migrate-RELEASE_REVISION
kubectl -n viberglass-workers get jobs,pods
kubectl -n viberglass-workers describe pod WORKER_POD
kubectl -n viberglass-workers logs job/WORKER_JOB
```

Investigate admission/RBAC, image pulls, scheduling, deadline/OOM, bootstrap authentication, and callback failures using these logs/events. Optional OTLP endpoints can be supplied through `backend.env`; authenticated worker telemetry credentials belong in the worker Secret. Cancellation deletes the Kubernetes Job; terminal/missing Jobs are reconciled into platform run status. Finished Jobs expire after an hour.

Helm uninstall removes managed resources, including the worker namespace and its Jobs. StatefulSet PVCs can remain and cloud databases/buckets are external. Inspect them explicitly; deleting the chart is not a cloud teardown or a backup. Do not delete a namespace shared with another application.

## Validation limits

Local tests establish application portability against kind/PostgreSQL/MinIO. They do not certify OVH endpoints, provider networking, policy enforcement, backup recovery, production TLS, or paid-model behavior. Validate these on the chosen cloud before calling the deployment production ready.
