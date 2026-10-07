# Install on Kubernetes

A Helm chart installs Viberglass into a Kubernetes cluster: the backend, the frontend and the database migrations, with each agent run as a Kubernetes Job in a separate namespace. Try it on a local kind cluster first, then install it on a managed cluster.

## On a local cluster

You need Docker 28.1 or newer, kind, kubectl, Helm 3 and Python 3, and about 40 GB of free disk for images and build caches.

```bash
python3 infra/kubernetes/scripts/local.py
```

The script builds the images from your checkout, creates a kind cluster called `viberglass-local`, generates development secrets, and installs the chart with PostgreSQL and MinIO inside the cluster. It builds the OpenCode worker; add `--agent codex` (or `claude-code`, `antigravity`, `kimi`, `mistral`, `pi`, `qwen`) to build another.

Then forward the app and storage ports, each in its own terminal:

```bash
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass port-forward svc/viberglass-frontend 3100:80
kubectl --kubeconfig /tmp/viberglass-local.kubeconfig -n viberglass port-forward svc/viberglass-minio 39000:9000
```

Open http://localhost:3100, create the administrator, and go through setup as described in [Install with Docker](install-docker.md#first-run-setup). The default compute is Kubernetes.

The full walkthrough, with checks and cleanup, is in [Run Viberglass locally on Kubernetes](https://github.com/Ilities/viberglass/blob/main/docs/local-kubernetes.md).

## On a managed cluster

You provide:

- A cluster with a NetworkPolicy-capable network plugin, an ingress controller, and DNS and TLS for your address.
- PostgreSQL.
- S3-compatible object storage with a bucket, reachable from the cluster and from browsers.
- Optionally, an SMTP server for email.

The backend, frontend and worker images are published to `ghcr.io/ilities` for each release; use the same release tag for all of them. To use images you build yourself, push them to your own registry instead.

Create the app and worker namespaces, then the secrets the chart reads: the database password and the two encryption keys in the app namespace, and the storage credentials in both. Generate strong, independent encryption keys and keep copies somewhere safe; without them, stored credentials can't be read. Write a values file with your images, address, database, storage and ingress, then:

```bash
helm upgrade --install viberglass infra/kubernetes/chart --namespace viberglass -f production-values.yaml --wait --wait-for-jobs --timeout 10m
```

Each install or upgrade runs the migrations as a Job before the backend starts. Keep the backend at one replica.

The values, secrets, network policy, upgrade and backup steps are in [Kubernetes deployment and operations](https://github.com/Ilities/viberglass/blob/main/docs/kubernetes-deployment.md).

## How agents run

Each run is a Job in the worker namespace, with CPU, memory, storage and time limits set on the runner. Workers have no Kubernetes service account token. They fetch the credentials their run is allowed from the backend when they start; the credentials aren't written into the Job. A namespace quota limits how many runs go at once. Cancelling a run deletes its Job.

## OVHcloud

OVHcloud Managed Kubernetes is the first managed cluster the chart is being validated on. The plan, and what's still to check, is in the [OVHcloud deployment plan](https://github.com/Ilities/viberglass/blob/main/docs/kubernetes-ovh-deployment-plan.md).
