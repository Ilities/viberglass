# Local Kubernetes: current support and verification

**Status: experimental runtime support, not a complete local installation.** The worker Job lifecycle and portable credentials/storage are implemented. A fresh cluster cannot yet install the full app and select Kubernetes through the normal setup UI. The commands below exercise the implemented runtime; they do not install the backend and frontend in the cluster.

For the currently supported full local application setup, see [local development](local-development.md). For storage and credential variables, see [portable storage and credentials](portable-storage-and-credentials.md).

## What works and what remains

| Capability | Current status |
| --- | --- |
| Worker execution as Kubernetes Jobs | Implemented; real fake-agent worker tested on kind |
| Result callbacks, duplicate submission, cancellation | Implemented and tested |
| Failed/missing Job reconciliation | Implemented; unit tested |
| Encrypted database secrets and run-bound credential delivery | Implemented; PostgreSQL smoke tested |
| Instructions, signed media URLs, session archives on alternative S3 storage | Implemented; MinIO smoke tested |
| Kubernetes strategy in normal setup and Clanker forms | Missing |
| Kubernetes strategy seeded by database migration | Missing |
| Kubernetes image/namespace availability and provisioning handler | Missing |
| Backend/frontend cluster installation, migration Job, RBAC, ingress, volumes | Missing |
| One integrated full-app test with a real agent and resumed session | Missing |
| Production operations: backup/restore, upgrades, resource policies | Not packaged or validated |

The setup/provisioning boundary still rejects Kubernetes in [`ProvisioningStrategyResolver`](../apps/platform-backend/src/provisioning/ProvisioningStrategyResolver.ts), whose strategy type includes only Docker, ECS, and Lambda. The Clanker strategy form still renders Docker fields for unknown strategies. The worker invoker exists, but these paths must be implemented before ordinary product setup works. Do not use manual database edits as an installation procedure.

## Prerequisites

- This branch's checkout: all worker and backend code must come from the same revision.
- Node.js 24 and npm for builds and smoke runners.
- Docker, with access to its daemon and capacity for image builds and disposable containers.
- `kind` and `kubectl` for the Kubernetes test.
- Network access for dependency/image downloads if they are not cached.

Run commands from the repository root:

```bash
npm install
npm run backend:build-deps
npm run build:worker
```

## 1. Verify portable credentials and object storage

```bash
npm run smoke:portable -w @viberglass/platform-backend
```

The runner starts disposable PostgreSQL and MinIO containers, configures the application against them, and uses generated test secrets. It checks database encryption/decryption, run credential selection, a Codex auth-cache write, instruction upload/download/delete, signed media download/delete, and session capture/restore without agent auth files. It removes its containers and temporary files on completion. It does not use an existing database or bucket.

Expected final output begins with `Portable smoke passed:`. This is a storage/credential integration test; no Kubernetes cluster or application UI is involved.

## 2. Verify a real worker in Kubernetes

Build a fake-agent image using the checked-in Dockerfiles. The fake agent needs no external model API key:

```bash
docker build -f infra/workers/docker/base/base-worker.Dockerfile -t viberglass-worker-base:local .
docker build -f infra/workers/docker/generated/fake.Dockerfile --build-arg BASE_IMAGE=viberglass-worker-base:local -t viberglass-worker-fake:local .
```

Create a disposable cluster and load the image:

```bash
kind create cluster --name viberglass-local --kubeconfig /tmp/viberglass-local.kubeconfig --wait 120s
kind load docker-image viberglass-worker-fake:local --name viberglass-local
export KUBECONFIG=/tmp/viberglass-local.kubeconfig
kubectl create namespace viberglass-workers
export KUBERNETES_WORKER_NAMESPACE=viberglass-workers
export KUBERNETES_SMOKE_IMAGE=viberglass-worker-fake:local
```

The runner starts a temporary callback server and Git repository on your host. Pods must be able to reach that server. On Linux with kind's Docker network, use its IPv4 gateway:

```bash
export KUBERNETES_SMOKE_HOST="$(docker network inspect kind --format '{{(index .IPAM.Config 0).Gateway}}')"
npm run smoke:kubernetes -w @viberglass/platform-backend
```

On another Docker setup, set `KUBERNETES_SMOKE_HOST` to a host address/name reachable from Pods. The Linux network gateway procedure is the tested configuration. A host firewall must allow the test's temporary callback port from the cluster network.

The runner submits a Job through the real invoker, checks duplicate submission, waits for the worker's result and Job completion, and cancels a second run. It creates and removes its own Jobs and temporary repository. Expected final output begins with `Kubernetes smoke passed:`.

For troubleshooting while it runs:

```bash
kubectl -n viberglass-workers get jobs,pods
kubectl -n viberglass-workers logs -l app.kubernetes.io/name=viberglass-worker --all-containers=true
kubectl -n viberglass-workers get events --sort-by=.metadata.creationTimestamp
```

Remove the disposable cluster afterwards:

```bash
KUBECONFIG=/tmp/viberglass-local.kubeconfig kind delete cluster --name viberglass-local
unset KUBECONFIG KUBERNETES_WORKER_NAMESPACE KUBERNETES_SMOKE_IMAGE KUBERNETES_SMOKE_HOST
```

The previous live cluster validation used kind v0.33.0 / Kubernetes v1.37.0 and a cached fake-worker base with this branch's compiled modules overlaid. The fresh image build above follows the checked-in Dockerfiles; a clean-machine image build remains a validation gate. The Kubernetes runner uses a temporary callback server, not the real platform backend, so it does not establish full application parity.

## Target full local installation

The intended install is one cluster containing frontend, backend, worker Jobs, PostgreSQL, S3-compatible storage such as MinIO, and an optional local SMTP service. External PostgreSQL/storage are also valid. Kubernetes does not require AWS for these application capabilities.

Before documenting that install as supported, complete these steps in the [deployment plan](kubernetes-ovh-deployment-plan.md):

1. Work package 4: seed the strategy, implement provisioning/availability checks, and expose Kubernetes in setup and Clanker configuration.
2. Work package 5: supply an installable chart or manifests with service accounts/RBAC, services, backend/frontend images, migration Job, storage, resource limits, and a documented local values file.
3. Validate the integrated journey: fresh install, sign-in/setup, create a Kubernetes Clanker, execute a real repository task, view results/media, cancel a run, resume an agent session, and restart the app without losing data.

That is the application parity target. AWS-specific mechanisms such as Lambda, IAM roles, CloudWatch, SES, and Amplify are replaced by cluster operations, database secrets, configurable telemetry, SMTP, and container hosting. Their managed-service operations do not come automatically with a self-hosted cluster.
