# Kubernetes deployment and operations

The chart is in [`infra/kubernetes/chart`](../infra/kubernetes/chart). It deploys the application into an existing Kubernetes cluster. The OVHcloud Pulumi stack is a subsequent work package; this chart does not create cloud resources.

## Production prerequisites

Provision a cluster, PostgreSQL, S3-compatible storage, an ingress controller, DNS/TLS, and optionally SMTP. Use a NetworkPolicy-capable CNI. The frontend is a static Vite build served by nginx, which proxies `/api` to the backend. The chart sets `PLATFORM_PUBLIC_API_URL` for browser media links and keeps `PLATFORM_API_URL` internal for worker callbacks. No separate browser API hostname is needed.

Images are published to GHCR for linux/amd64 and linux/arm64 on every change to `main` and on each release:

| Image | Repository |
| --- | --- |
| Backend | `ghcr.io/ilities/viberglass-backend` |
| Frontend | `ghcr.io/ilities/viberglass-frontend` |
| Workers | `ghcr.io/ilities/viberator-worker-<agent>` (the agent catalog's names) |

Each is tagged with the release (for example `v1.0.0`), the commit SHA and `latest`. Use the same release tag for all three, and pin it rather than following `latest`. The chart's default worker repositories follow the agent catalog; `workers.registry` and `workers.imageTag` resolve them, and explicit runner images override the catalog default.

To run your own builds instead, build and push each image from the same revision to your registry:

```bash
docker build -f apps/platform-backend/Dockerfile.prod -t YOUR_REGISTRY/viberglass-backend:REVISION .
docker build -f apps/platform-frontend/Dockerfile.prod -t YOUR_REGISTRY/viberglass-frontend:REVISION .
docker build -f infra/workers/docker/base/base-worker.Dockerfile -t YOUR_REGISTRY/viberator-base-worker:REVISION .
docker build -f infra/workers/docker/generated/opencode.Dockerfile --build-arg BASE_IMAGE=YOUR_REGISTRY/viberator-base-worker:REVISION -t YOUR_REGISTRY/viberator-worker-opencode:REVISION .
```

## Secrets and values

Create the app namespace and worker namespace before loading secrets. Supply:

| Namespace | Secret | Keys |
| --- | --- | --- |
| App | `viberglass-app` | `DB_PASSWORD`, `SECRETS_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` |
| App | `viberglass-storage` | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_SESSION_TOKEN` |
| Workers | `viberglass-storage` | Same platform storage keys; no database/encryption/model keys |

Generate independent strong encryption keys and retain them securely. Secrets must be supplied out of band or through your secret manager. The chart never generates production credentials. An existing worker Namespace must have Helm ownership annotations for the release, since the chart manages it; create/adopt only a namespace dedicated to this installation. The local installer handles ownership on namespaces it creates.

Example non-secret values:

```yaml
backend:
  image: ghcr.io/ilities/viberglass-backend:v1.0.0
frontend:
  image: ghcr.io/ilities/viberglass-frontend:v1.0.0
publicUrl: https://viberglass.example.com
workers:
  namespace: viberglass-workers
  registry: ghcr.io/ilities
  imageTag: v1.0.0
database:
  host: postgres.example.internal
  name: viberglass
  user: viberglass
  ssl: true
storage:
  endpoint: https://s3.example.com
  publicEndpoint: https://s3.example.com
  region: YOUR_SIGNING_REGION
  bucket: viberglass
  forcePathStyle: true
ingress:
  enabled: true
  className: nginx
  host: viberglass.example.com
  tls:
    - hosts: [viberglass.example.com]
      secretName: viberglass-tls
```

The published images are public and need no pull Secret. For a private registry, create pull Secrets independently in both namespaces: `imagePullSecrets` serves app and migration Pods, and `workers.imagePullSecrets` names Secrets in the worker namespace. For private Git, private object storage, or internal telemetry, add allowed destinations to `networkPolicy.workerExtraEgress` using Kubernetes NetworkPolicy egress rules. Public HTTP(S)/SSH and cluster DNS/backend storage are allowed by default. Service endpoints must be reachable from nodes/Pods, and database network access must be allowed by the provider.

```bash
helm upgrade --install viberglass infra/kubernetes/chart --namespace viberglass -f production-values.yaml --wait --wait-for-jobs --timeout 10m
```

A regular migration Job runs on each Helm revision. Backend init waits for the required migration marker. This avoids hook ordering deadlocks on a fresh database. Review migration logs on errors. Set `migration.marker` to the newest required migration when extending the distribution. Existing backend Pods can remain running during upgrades, so future migrations must support rolling deployments.

Embedded PostgreSQL/MinIO are available in `values-local.yaml` for development. They are single instance services, without automated backups or high availability. External object storage buckets must already exist; bucket creation runs only for the embedded MinIO option.

## Upgrade, rollback and capacity

- Back up the database and encryption keys before migrations. Publish immutable app/worker image tags; update values and run Helm upgrade with `--wait --wait-for-jobs`.
- Existing worker Jobs retain their image and run during app rolling updates. Keep the callback service stable and allow sufficient termination time. Maintain bootstrap/callback compatibility between deployed versions.
- Helm rollback can restore a Deployment, **not reverse database migrations**. Review schema compatibility before rollback; restore a backup when rollback requires it.
- Adjust `workers.quota` and per-Clanker resources together. Quotas do not add nodes; pending Pods need schedulable node capacity. Production nodes must have room for the app, system workloads, and concurrent Jobs.
- The backend currently runs sweepers/dispatch coordination in process. Keep `backend.replicas: 1` until multiple backend replicas have been explicitly validated.
- Use ingress annotations/TLS resources appropriate to your installed controller. Certificate issuance/renewal belongs to the cluster operator; the chart references an existing TLS Secret.

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
