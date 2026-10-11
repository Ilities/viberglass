# 06 · Kubernetes deployment

The Helm chart (`infra/kubernetes/chart/`) and the Kubernetes runner strategy, first on a local kind cluster and then on a managed cluster. Background: [../../kubernetes-deployment.md](../../kubernetes-deployment.md), [../../local-kubernetes.md](../../local-kubernetes.md), [../../portable-storage-and-credentials.md](../../portable-storage-and-credentials.md).

## Contents

- [K8S-00 · Merge gate](#k8s-00-merge-gate)
- [Known issues](#known-issues)
- [Local kind cluster (K8S-01 – K8S-15)](#local-kind-cluster-k8s-01--k8s-15)
- [Managed cluster (K8S-20 – K8S-32)](#managed-cluster-k8s-20--k8s-32)

## K8S-00 · Merge gate

1. Check `main` contains the Kubernetes merge (`git log --oneline | grep -i kubernetes`) and that `apps/platform-backend/src/migrations/101_kubernetes_deployment_strategy.ts` exists. Backend startup must wait for all numbered migrations shipped in its image.
2. Delete any kind cluster installed from the old branch (`kind delete cluster --name viberglass-local`): its migration history has the old `099_`/`088_` names.

Expect: merged and renumbered; no stale cluster.

## Known issues

| # | Issue | Where it shows |
|---|---|---|
| K6 | kind's default CNI doesn't enforce NetworkPolicy | K8S-12 vs K8S-27 |
| K7 | `helm uninstall` deletes the worker namespace and its Jobs; Helm rollback doesn't reverse migrations | K8S-29 |

K1 and K2 have regression fixes: the installer uses catalog Dockerfiles/image names (including Claude's multi-agent default), and the platform smoke discovers the installed worker namespace. Local installs retain `<ns>-workers` by default; `--worker-namespace` overrides it. For custom installations, give the smoke `--namespace` and `--release`.

K3–K5 are implemented: Pod state/events are persisted in the run log, startup failures reconcile after a short grace period, callback tokens are mounted from run-owned Secrets, and workers receive scoped storage URLs instead of bucket credentials. The deployment intentionally uses one backend replica.

## Local kind cluster (K8S-01 – K8S-15)

Needs: Docker 28.1+, kind, kubectl, Helm 3, Python 3, ~40 GB free, ports 3100 and 39000 free.

### K8S-01 · Install
1. `python3 infra/kubernetes/scripts/local.py --agent opencode` (builds images, creates kind cluster `viberglass-local`, installs with `values-local.yaml`).
2. `export KUBECONFIG=/tmp/viberglass-local.kubeconfig`; `kubectl get pods -A`.
3. Port-forward `svc/viberglass-frontend 3100:80` and `svc/viberglass-minio 39000:9000` in the app namespace.

Expect: backend, frontend, Postgres, MinIO running; migration Job completed; http://localhost:3100 opens registration.

### K8S-02 · Automated platform smoke
1. With both port-forwards up: `python3 infra/kubernetes/scripts/platformSmoke.py`.

Expect: activation, media upload and signed download, a research turn, a resumed second turn in a new Pod, two cancellations with their Jobs deleted, all pass.

### K8S-03 · First-run setup on Kubernetes
1. Register, run setup with a real key (SETUP-01/02), using a repository reachable from the cluster (public GitHub).

Expect: the agent step reports Kubernetes compute; Agents & runners shows the default agent on Kubernetes, Ready.

### K8S-04 · A run as a Job
1. Ask for research; `kubectl get jobs,pods -n <worker-ns> -w`.

Expect: Job `viberglass-<hash>` with `restartPolicy: Never`, no service-account token, requests = limits; callbacks arrive; research appears.

### K8S-05 · Credentials by bootstrap
1. `kubectl logs job/<name> -n <worker-ns>` for the run.
2. `kubectl get job <name> -o yaml`.

Expect: logs show credentials fetched once from bootstrap; the Job spec holds no model key or callback token. It references the run's token Secret and has no `envFrom` importing storage credentials.

### K8S-06 · Session continuity across Pods
1. Ask a follow-up.

Expect: a new Pod; "continued its session"; the archive is in MinIO.

### K8S-07 · Media through S3
1. Upload a screenshot; open it.

Expect: stored in MinIO; the browser loads it via `S3_PUBLIC_ENDPOINT` (localhost:39000).

### K8S-08 · Cancel
1. Cancel during dispatch and during a run.

Expect: the Job is deleted (background propagation) both times; the turn shows stopped.

### K8S-09 · Lost Job
1. Start a run; `kubectl delete job <name>`.

Expect: within ~3 minutes the reconciler fails the run as **Agent stopped responding**.

### K8S-10 · Job finished without a result
1. Start a run; kill the worker process inside the Pod so the Job ends without a result callback.

Expect: the reconciler fails the run after the 2-minute grace period.

### K8S-11 · Bad image
1. Set a runner's container image to a tag that doesn't exist; start it; run a task.

Expect: activation can succeed; within roughly three minutes, the run fails with an image-pull detail and Pod events in its worker log.

### K8S-12 · Quota
1. Lower `workers.quota` (e.g. 1 CPU) with `helm upgrade`; start two runs at once.

Expect: the second Job is refused by admission; the run fails with a clear setup failure.

### K8S-13 · Rolling upgrade during a run
1. Start a long run; `helm upgrade` with a new backend image tag.

Expect: the running Job survives; its result is recorded by the new backend.

### K8S-14 · Smoke subset
1. Run the README's smoke subset on K8S-KIND.

Expect: same results as locally.

### K8S-15 · Cleanup
1. `kind delete cluster --name viberglass-local`.

## Managed cluster (K8S-20 – K8S-32)

Needs: a managed Kubernetes cluster (e.g. OVHcloud MKS) with an ingress controller and a CNI that enforces NetworkPolicy, a container registry, managed Postgres, S3-compatible object storage with a pre-created bucket, a DNS name and a TLS Secret.

### K8S-20 · Images
1. Build and push backend (`apps/platform-backend/Dockerfile.prod`), frontend (`apps/platform-frontend/Dockerfile.prod`), the worker base and per-agent workers (`infra/workers/docker/generated/<agent>.Dockerfile --build-arg BASE_IMAGE=…`) to the registry.

Expect: images in the registry with one tag.

### K8S-21 · Namespaces and Secrets
1. Create the app and worker namespaces (worker namespace with Helm ownership labels/annotations).
2. Create `viberglass-app` (DB password, two encryption keys) and `viberglass-storage` (S3 keys) in the application namespace, and registry pull secrets in both namespaces.

Expect: Secrets present; nothing secret in values files.

### K8S-22 · Install
1. `helm upgrade --install viberglass infra/kubernetes/chart -n viberglass -f production-values.yaml --wait --wait-for-jobs --timeout 10m` with images, `publicUrl`, database, storage, workers, ingress and TLS values.

Expect: migration Job completes; backend ready (its init container waited for all migrations in the backend image); ingress serves `https://<host>`.

### K8S-23 · TLS and CORS
1. Open the app over HTTPS; sign in; upload media.

Expect: valid certificate; the session cookie works; browser downloads from the object storage's public endpoint aren't blocked by CORS.

### K8S-24 · Product on the cluster
1. K8S-03 to K8S-10 on the managed cluster with a real model.

Expect: same as kind.

### K8S-25 · Email
1. Set SMTP via `backend.env`; test email; invite someone.

Expect: delivered.

### K8S-26 · Webhooks and Slack
1. GH-07 and SLACK-02 to SLACK-04 against the ingress URL.

Expect: same as locally.

### K8S-27 · NetworkPolicy enforcement
1. From a worker Pod (`kubectl debug` or a test Job with the worker labels), try reaching: the backend on 3000, a private CIDR address, the internet on 443, another Pod's port.

Expect: backend and internet allowed; private ranges and other Pods blocked (unless allowed via `workerExtraEgress`).

### K8S-28 · Private Git or storage
1. Point a space at a Git host on a private network; run a task. Then add its CIDR to `networkPolicy.workerExtraEgress` and retry.

Expect: blocked, then allowed.

### K8S-29 · Upgrade, rollback, uninstall
1. Upgrade to a newer chart and image; roll back with `helm rollback`.
2. On a throwaway install, `helm uninstall`.

Expect: (1) the app keeps working; migrations are not rolled back (K7). (2) The worker namespace and its Jobs go away.

### K8S-30 · Security review
1. Inspect a worker Job spec and the worker namespace's Secrets.

Expect: no model/SCM/storage credentials or callback token in specs. The run's token Secret is immutable and owned by its Job; cancellation removes both. Workers cannot obtain storage URLs for another run's objects or after termination.

### K8S-31 · Backup and restore
1. Back up the database and bucket; restore into a fresh install; sign in.

Expect: tasks, documents, media and secrets usable after restore (the same encryption keys are needed).

### K8S-32 · Smoke subset and long run
1. Run the README's smoke subset; run one turn longer than 30 minutes.

Expect: smoke passes; a healthy run continues past thirty minutes. Silent agent steps still send heartbeats. Stale workers fail after the inactivity grace period; the Kubernetes Job deadline remains effective.
