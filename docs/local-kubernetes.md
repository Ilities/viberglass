# Run Viberglass locally on Kubernetes

The Helm distribution installs the backend, React/Vite frontend, migration Jobs, PostgreSQL and MinIO into a local kind cluster. Agent executions use separate Kubernetes Jobs. This is an experimental self-hosted application installation; an OVHcloud production deployment has not yet been validated.

## Prerequisites

- Docker 28.1 or newer (the installer uses platform-specific image export), with enough disk and memory for the application and worker image builds. Reserve about 40 GiB of free disk for build caches, images and cluster data; image loading is substantial on the first run.
- `kind`, `kubectl`, Helm 3, and Python 3 on your PATH.
- Node.js 24 and npm only for the optional host-side smoke tests.
- Free host ports 3100 (app) and 39000 (signed storage downloads).

## Install

From the repository root:

```bash
python3 infra/kubernetes/scripts/local.py
```

This builds images from your checkout, creates `viberglass-local`, loads images, generates development secrets, and installs the chart with persistent PostgreSQL and MinIO volumes. It uses `/tmp/viberglass-local.kubeconfig` without changing your default kubeconfig. Initial builds download dependencies and can take several minutes. Rerun with `--skip-build` to reuse your images. Reinstallation retains existing secrets and PVC data.

Run these commands in separate terminals:

```bash
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass port-forward svc/viberglass-frontend 3100:80
```

```bash
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass port-forward svc/viberglass-minio 39000:9000
```

Open **http://localhost:3100**, register the first administrator, and complete setup. The default compute is Kubernetes when the backend has a worker namespace configured. Add your model key through setup or Secrets; it is encrypted in PostgreSQL. Workers fetch only the credentials authorized for their run.

The installer builds the OpenCode worker and a deterministic fake worker. To use another agent, build and load its image first:

```bash
python3 infra/kubernetes/scripts/local.py --agent codex
```

Use `--agent claude-code`, `gemini`, `kimi`, `mistral`, `pi`, or `qwen` as appropriate. Each invocation retains already-loaded images. A Clanker can use the default catalog image or an explicit image. Kubernetes forms support CPU, memory, temporary storage, and time limits. Activation checks namespace access, Job admission, and create/get/delete permissions; it cannot prove an image exists in the registry. Diagnose image pull failures through Pod events.

## Architecture and persistence

- Backend and frontend are Deployments in `viberglass`; PostgreSQL and MinIO are StatefulSets with PVCs.
- Workers run in `viberglass-workers`, with no Kubernetes service account token. The backend has namespaced Job permissions.
- Model/Git credentials stay in the encrypted database and are delivered through authenticated bootstrap. The worker namespace Secret contains platform object-storage credentials only.
- `S3_ENDPOINT` is reachable from Pods. `S3_PUBLIC_ENDPOINT` is the browser-reachable signing endpoint; locally it is `http://localhost:39000`. Worker media links use the internal endpoint.
- Instructions, task media, phase documents, and archived conversation state use object storage. Restarts retain data while the cluster/PVCs exist.
- Resource requests and limits consume cluster capacity. A worker namespace quota limits concurrency; requests exceeding quota fail admission.
- The chart includes network policies. Local validation does not certify policy enforcement. Use a NetworkPolicy-capable CNI in a production cluster and test private Git/storage egress rules.

The application compute/storage/credential paths are available without AWS. This does not supply AWS-managed infrastructure equivalents: production databases, backups, ingress/TLS, email, registry publishing, and cloud provisioning remain operator responsibilities. See [Kubernetes deployment and operations](kubernetes-deployment.md).

## Inspect, update, remove

```bash
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass get pods,jobs,pvc
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass logs deployment/viberglass-backend
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass-workers get jobs,pods
```

After changing code, rerun the installer to rebuild/load images. Local tags are mutable: restart the app Deployments after the installation if the pod template did not change:

```bash
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass rollout restart deployment/viberglass-backend deployment/viberglass-frontend
```

For a clean reset, `kind delete cluster --name viberglass-local` destroys the cluster **and all its local data**. Export backups before deletion. Keep encryption keys with database backups; restoring ciphertext without its keys does not restore usable credentials.

## Optional isolated runtime checks

These exercise individual components and are separate from the installed app. Install/build host dependencies first:

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

Create a separate disposable cluster and load the image (use `linux/arm64` on ARM):

```bash
kind create cluster --name viberglass-runtime-smoke --kubeconfig /tmp/viberglass-runtime-smoke.kubeconfig --wait 120s
docker save --platform linux/amd64 -o /tmp/viberglass-runtime-worker.tar viberglass-worker-fake:local
kind load image-archive /tmp/viberglass-runtime-worker.tar --name viberglass-runtime-smoke
export KUBECONFIG=/tmp/viberglass-runtime-smoke.kubeconfig
kubectl create namespace viberglass-workers
export KUBERNETES_WORKER_NAMESPACE=viberglass-workers
export KUBERNETES_SMOKE_IMAGE=viberglass-worker-fake:local
```

The runner starts a temporary callback server and Git repository on your host. Pods must be able to reach that server. On Linux with kind's Docker network, use its IPv4 gateway:

```bash
export KUBERNETES_SMOKE_HOST="$(docker network inspect kind | python3 -c 'import json,sys; print(next(c["Gateway"] for c in json.load(sys.stdin)[0]["IPAM"]["Config"] if ":" not in c["Gateway"]))')"
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
KUBECONFIG=/tmp/viberglass-runtime-smoke.kubeconfig kind delete cluster --name viberglass-runtime-smoke
unset KUBECONFIG KUBERNETES_WORKER_NAMESPACE KUBERNETES_SMOKE_IMAGE KUBERNETES_SMOKE_HOST
```

The full application has been installed on kind v0.33.0 / Kubernetes v1.37.0 using fresh images built from the checked-in Dockerfiles. A repeatable installed-platform check uses an in-cluster temporary Git fixture:

```bash
python3 infra/kubernetes/scripts/platformSmoke.py
```

Run it against a disposable installation with both port forwards active. It creates a test administrator if the database is empty, a fake-agent credential/runner, and test spaces/tasks. It retains synthetic login credentials in `/tmp/viberglass-platform-smoke-credentials.json` with mode 0600; pass `--credentials` pointing to an existing credentials JSON (`email`, `password`) if the app already has an administrator. It removes its temporary Git Pod/Service/ConfigMap/egress policy on exit. App test data remains until the disposable cluster is removed.

The check validates strategy activation, credential bootstrap, media upload/download, research result persistence, session continuation in a different Pod, and cancellation during execution and dispatch. It needs no paid model key and does not push to external repositories. Paid-model and real-cloud behavior remain separate validation gates.

## Verified in this branch

- Fresh backend/frontend/worker images and a clean kind installation, including all migrations through 088.
- Backend unit suite: 152 suites / 1,122 tests; frontend suite: 48 suites / 235 tests.
- Real PostgreSQL/MinIO integration: encrypted run credentials, terminal status guards, Codex refresh, instructions, signed media, deletion, and session archives.
- Installed app: activation, scoped credential/instruction bootstrap, browser media downloads, research documents, a resumed conversation in a separate Pod, and cancellation with worker Job deletion.
- A running worker completed across backend/frontend rolling restarts.
- PostgreSQL and MinIO Pod restarts retained login, stored credentials, documents and session state; the same conversation continued on turn 3.
- Kubernetes create/edit forms checked in an authenticated browser.

OVHcloud provisioning, provider storage/networking, paid-model behavior, network policy enforcement, and backup restoration have not been certified by these local checks.
