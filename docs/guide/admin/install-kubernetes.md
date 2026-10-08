# Install on Kubernetes

Deploy Viberglass to an existing Kubernetes cluster with the [Helm chart](../../../infra/kubernetes/chart). It runs one backend, one frontend, and a migration Job. Each agent run gets its own Job in a dedicated worker namespace. This guide uses external PostgreSQL and S3-compatible storage; for a disposable installation with bundled PostgreSQL/MinIO, use the [local walkthrough](../../local-kubernetes.md).

The examples use Helm release `viberglass`, app namespace `viberglass`, and worker namespace `viberglass-workers`. Use dedicated namespaces. If you change these names, update the values and commands together. Run commands in Bash from the repository root unless stated otherwise.

- [Requirements](#requirements)
- [1. Choose the source and images](#1-choose-the-source-and-images)
- [2. Create namespaces](#2-create-namespaces)
- [3. Create application Secrets](#3-create-application-secrets)
- [4. Configure the installation](#4-configure-the-installation)
- [5. Configure DNS, TLS and registry access](#5-configure-dns-tls-and-registry-access)
- [6. Install and check readiness](#6-install-and-check-readiness)
- [7. Complete setup and run a task](#7-complete-setup-and-run-a-task)
- [Troubleshooting](#troubleshooting)
- [Upgrades, backups and removal](#upgrades-backups-and-removal)
- [Build your own images](#build-your-own-images)

## Requirements

| Requirement | What to prepare |
| --- | --- |
| Kubernetes | Linux nodes, working cluster DNS, and capacity for the application plus agent Jobs. The runtime was tested on Kubernetes 1.37 with kind; validate your distribution. |
| Operator tools | Git, kubectl configured for the target cluster, Helm 3, Bash and OpenSSL. Docker/buildx is needed only for building or inspecting images. |
| Install permissions | Permission to create namespaces, Deployments, Services, ServiceAccounts, Jobs, ConfigMaps, Secrets, Roles/RoleBindings, quotas, NetworkPolicies and Ingresses, and grant the chart's namespaced RBAC permissions. |
| PostgreSQL | An existing database and login allowed to create/alter its schema and run migrations, reachable from app Pods. Use a dedicated database; enable backups. |
| Object storage | An existing private S3-compatible bucket and credentials allowed to read, write, list and delete its objects. Backend and worker Pods must reach the storage endpoint; browsers must reach its public endpoint. |
| Networking | An installed [Ingress controller](https://kubernetes.io/docs/concepts/services-networking/ingress/), a DNS name and a certificate for it. Set up a [NetworkPolicy-capable CNI](https://kubernetes.io/docs/concepts/services-networking/network-policies/) to enforce the chart's policies. |
| First task | A supported model API key or compatible model endpoint, and a GitHub repository/access token. SMTP is optional for email invitations and notifications. |

The chart does not provision the cluster, database, external bucket, ingress controller, DNS or certificates. External storage bucket creation is your responsibility. A default worker requests and limits 500m CPU, 1 GiB memory and 2 GiB ephemeral storage; adjust runner settings and the namespace quota to fit your tasks and available nodes. Keep `backend.replicas: 1`.

## 1. Choose the source and images

```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
git checkout YOUR_RELEASE_OR_COMMIT
```

Replace `YOUR_RELEASE_OR_COMMIT` with the revision you intend to deploy. Use the chart and backend/frontend/worker images from that revision. The publish workflows target `ghcr.io/ilities` on releases and relevant changes to `main`; check that all required images exist under your chosen tag. The chart is installed from this checkout, rather than a Helm repository.

**For unpublished changes, including the Kubernetes completion work before its release, use [your own image builds](#build-your-own-images).** An older published worker does not support the new mounted-token and scoped-storage flow. Use immutable tags instead of `latest`.

Worker image names come from the [image catalog](../../../packages/types/src/workerImageCatalog.json):

| Agent | Image repository under `ghcr.io/ilities` |
| --- | --- |
| OpenCode | `viberator-worker-opencode` |
| Codex | `viberator-worker-codex` |
| Claude Code | `viberator-worker-multi-agent` |
| Google Antigravity | `viberator-worker-antigravity` |
| Kimi Code | `viberator-worker-kimi` |
| Mistral Vibe | `viberator-worker-mistral` |
| Pi | `viberator-worker-pi` |
| Qwen Code | `viberator-worker-qwen` |

With Docker/buildx available, verify the tag and node architecture before installing; repeat the worker check for each agent you will use:

```bash
VIBERGLASS_TAG=YOUR_MATCHING_IMAGE_TAG
docker buildx imagetools inspect "ghcr.io/ilities/viberglass-backend:$VIBERGLASS_TAG"
docker buildx imagetools inspect "ghcr.io/ilities/viberglass-frontend:$VIBERGLASS_TAG"
docker buildx imagetools inspect "ghcr.io/ilities/viberator-worker-opencode:$VIBERGLASS_TAG"
```

## 2. Create namespaces

Confirm that kubectl points at the intended cluster:

```bash
kubectl config current-context
kubectl get nodes
kubectl get ingressclass
kubectl create namespace viberglass
kubectl create namespace viberglass-workers
kubectl label namespace viberglass-workers app.kubernetes.io/managed-by=Helm
kubectl annotate namespace viberglass-workers meta.helm.sh/release-name=viberglass meta.helm.sh/release-namespace=viberglass
```

The worker namespace belongs to this Helm release. Its ownership metadata lets Helm use the namespace you created before installation. If it already exists, verify that it is dedicated to this installation and has these labels/annotations; do not adopt a shared namespace. Uninstalling the release deletes the worker namespace and its Jobs.

## 3. Create application Secrets

Use your secret manager to supply the following Secrets in the **app namespace only**, or follow the file-based commands below.

| Secret | Required keys |
| --- | --- |
| `viberglass-app` | `DB_PASSWORD`, `SECRETS_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` |
| `viberglass-storage` | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; also `S3_SESSION_TOKEN` if your provider requires one |

Generate the two encryption keys once, retain them with your backups, and reuse them on upgrades/restores. Regenerating them makes existing encrypted credentials unreadable. These deployment Secrets are separate from model and repository credentials, which you add in the app after installation.

Keep local installation files outside the checkout. The commands prompt for credentials without putting them in shell history and write files readable only by your user:

```bash
VIBERGLASS_INSTALL_DIR="$HOME/viberglass-install"
install -d -m 700 "$VIBERGLASS_INSTALL_DIR"
(
  umask 077
  read -r -s -p 'PostgreSQL password: ' VIBERGLASS_DB_PASSWORD
  printf '\n'
  printf 'DB_PASSWORD=%s\n' "$VIBERGLASS_DB_PASSWORD" > "$VIBERGLASS_INSTALL_DIR/app.env"
  printf 'SECRETS_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> "$VIBERGLASS_INSTALL_DIR/app.env"
  printf 'WEBHOOK_SECRET_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> "$VIBERGLASS_INSTALL_DIR/app.env"
)
(
  umask 077
  read -r -s -p 'S3 access key: ' VIBERGLASS_S3_ACCESS_KEY
  printf '\n'
  read -r -s -p 'S3 secret key: ' VIBERGLASS_S3_SECRET_KEY
  printf '\n'
  printf 'S3_ACCESS_KEY_ID=%s\nS3_SECRET_ACCESS_KEY=%s\n' \
    "$VIBERGLASS_S3_ACCESS_KEY" "$VIBERGLASS_S3_SECRET_KEY" > "$VIBERGLASS_INSTALL_DIR/storage.env"
)
kubectl -n viberglass create secret generic viberglass-app --from-env-file="$VIBERGLASS_INSTALL_DIR/app.env"
kubectl -n viberglass create secret generic viberglass-storage --from-env-file="$VIBERGLASS_INSTALL_DIR/storage.env"
```

These are first-install commands. If the Secrets already exist, use your existing values and secret-management process. If using temporary storage credentials, add `S3_SESSION_TOKEN` to `storage.env` before creating the Secret, and arrange their renewal.

Do not copy storage or model credentials into the worker namespace. The backend supplies exact run credentials and short-lived storage URLs. It creates an immutable callback-token Secret for each run, owned by its Job, which is deleted with that Job. Workers mount no Kubernetes API token.

## 4. Configure the installation

```bash
cp infra/kubernetes/chart/values-production.example.yaml "$VIBERGLASS_INSTALL_DIR/values.yaml"
```

Edit this [non-secret example](../../../infra/kubernetes/chart/values-production.example.yaml), replacing every `REPLACE_WITH_...` value and example hostname:

| Setting | Use |
| --- | --- |
| `backend.image`, `frontend.image` | Complete image references with the matching immutable tag. |
| `workers.registry`, `workers.imageTag` | Registry/repository prefix and tag for the catalog worker images. An explicit runner image overrides the catalog selection. |
| `publicUrl`, `ingress.host`, `ingress.tls[].hosts` | Your HTTPS URL and matching hostname, without a trailing slash in `publicUrl`. |
| `database.host/port/name/user/ssl` | Your database connection. `DB_PASSWORD` comes from the app Secret. Keep `enabled: false` for external PostgreSQL. |
| `storage.endpoint/publicEndpoint/region/bucket/forcePathStyle` | Your provider's endpoints, signing region, existing bucket and addressing mode. Keep `enabled: false` for external storage. |
| `ingress.className`, `ingress.tls[].secretName` | Your installed ingress class and TLS Secret in the app namespace. |
| `workers.quota` | Optional overrides of the [chart defaults](../../../infra/kubernetes/chart/values.yaml) for concurrent Pods and CPU/memory/disk. Quotas do not add node capacity. |

Use a storage endpoint without embedded credentials. The backend and worker Pods use `storage.endpoint`; browsers download media using signed URLs at `storage.publicEndpoint`. If both can use the same HTTPS endpoint, set both to it. Configure bucket CORS for your `publicUrl` if required by browser requests to your provider; confirm media downloads during verification. The bucket stays private.

For optional email, add `SMTP_URL` as another key in `viberglass-app` using your secret manager, and set `backend.env.EMAIL_FROM` to your sender address. Keep SMTP URLs containing passwords out of the values file. After changing an existing Secret, restart the backend as described under upgrades. Slack and other integrations are covered in [repositories and integrations](repositories-and-integrations.md).

The frontend serves the app and proxies `/api` to the backend, so no separate API hostname or frontend build-time API URL is needed. Worker callbacks use the chart's internal backend Service. Do not point `PLATFORM_API_URL` at an unrelated external API.

Default worker policies allow cluster DNS, the backend, bundled MinIO, and public IPv4 HTTP/HTTPS/SSH. Private Git, private storage, internal model/telemetry endpoints, nonstandard ports, IPv6 egress or NodeLocal DNS require matching rules in `networkPolicy.workerExtraEgress`. For example, to reach a private HTTPS service:

```yaml
networkPolicy:
  workerExtraEgress:
    - to:
        - ipBlock:
            cidr: 10.20.30.0/24  # Replace with the actual destination range.
      ports:
        - protocol: TCP
          port: 443
```

For NodeLocal DNS, add its actual IP as an `ipBlock` and allow both UDP and TCP port 53. Existing cluster policies must also permit app-to-database/storage access and ingress-controller-to-frontend traffic. Verify enforcement on your CNI; creating NetworkPolicy objects alone does not enforce them.

## 5. Configure DNS, TLS and registry access

Point your hostname at the ingress controller's external address. Supply a certificate with that hostname in a TLS Secret in the app namespace:

```bash
kubectl -n viberglass create secret tls viberglass-tls --cert=/path/to/fullchain.pem --key=/path/to/privkey.pem
```

Alternatively, have your existing certificate controller create `viberglass-tls` and add the controller's required annotations to `ingress.annotations`. The chart references the Secret and does not issue certificates. HTTPS is required for production sign-in cookies.

For a private registry, create a [pull Secret](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) in **both** namespaces. With a Docker config already containing the registry login:

```bash
kubectl -n viberglass create secret generic registry-pull --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=/path/to/registry-config.json
kubectl -n viberglass-workers create secret generic registry-pull --type=kubernetes.io/dockerconfigjson --from-file=.dockerconfigjson=/path/to/registry-config.json
```

Add these settings to your values file, merging `workers.imagePullSecrets` into the existing `workers` section:

```yaml
imagePullSecrets:
  - name: registry-pull
workers:
  imagePullSecrets:
    - registry-pull
```

App/migration Pods read `imagePullSecrets`; worker Pods read `workers.imagePullSecrets` in their own namespace. Public images that allow anonymous pulls need neither Secret.

## 6. Install and check readiness

Validate and render the values before installing:

```bash
helm lint infra/kubernetes/chart -f "$VIBERGLASS_INSTALL_DIR/values.yaml"
helm template viberglass infra/kubernetes/chart --namespace viberglass -f "$VIBERGLASS_INSTALL_DIR/values.yaml" > "$VIBERGLASS_INSTALL_DIR/rendered.yaml"
helm upgrade --install viberglass infra/kubernetes/chart --namespace viberglass \
  -f "$VIBERGLASS_INSTALL_DIR/values.yaml" --wait --wait-for-jobs --timeout 10m
kubectl -n viberglass rollout status deployment/viberglass-backend --timeout=5m
kubectl -n viberglass rollout status deployment/viberglass-frontend --timeout=5m
kubectl -n viberglass get pods,jobs,services,ingress
helm status viberglass --namespace viberglass
```

The migration Job must complete and both Deployments must become ready. The backend's init container waits for every migration in its image. On the first install the Job is `viberglass-migrate-1`; later names end in the Helm revision. A Helm timeout leaves resources available for diagnosis; check migration logs before retrying. See the [Helm upgrade reference](https://helm.sh/docs/helm/helm_upgrade/) for the wait options.

Test the public address, replacing the example hostname:

```bash
curl --fail --show-error https://viberglass.example.com/health
curl --fail --show-error https://viberglass.example.com/api/auth/setup-status
```

`/health` checks the frontend route. The setup-status endpoint exercises the frontend proxy, backend and database; a fresh database returns `{"requiresInitialUser":true}`. Check that the browser sees a valid TLS certificate, too.

## 7. Complete setup and run a task

Open your HTTPS address and create the initial administrator before giving others access. First-run setup then connects the model, repository and first space, and starts a default runner on Kubernetes. If using your own builds, select an agent whose image you built and pushed. See [agents and models](agents-and-models.md) and [repository setup](repositories-and-integrations.md) for credential choices. Store keys using database storage for a deployment without AWS SSM.

Start the suggested read-only planning task and watch the worker namespace:

```bash
kubectl -n viberglass-workers get jobs,pods --watch
```

Stop the watch with Ctrl-C. Verify that the task receives its result and the Job completes. Then upload/download task media, run another turn in the same task to check session restoration in a new Pod, and cancel a running task. Cancellation should remove its Job and auth Secret. Finished Jobs and their auth Secrets expire after an hour. A healthy run can exceed thirty minutes; its runner deadline defaults to one hour and can be changed in the runner's Kubernetes settings.

Do not use the standalone `smoke:kubernetes` runner as an installed-platform check: it creates its own callback server and is intended for a disposable test cluster. For further deployment checks, use the [manual Kubernetes checklist](../../testing/e2e-manual/06-kubernetes.md).

## Troubleshooting

```bash
kubectl -n viberglass logs deployment/viberglass-backend
kubectl -n viberglass get jobs
kubectl -n viberglass logs job/viberglass-migrate-1 -c migrate
kubectl -n viberglass-workers get events --sort-by=.metadata.creationTimestamp
kubectl -n viberglass-workers describe pod WORKER_POD
kubectl -n viberglass-workers logs job/WORKER_JOB
```

Use the actual migration revision, Pod and Job names from `kubectl get`. Worker Pod state and events also appear in the app's run log.

| Symptom | Check |
| --- | --- |
| Helm reports invalid ownership | Worker namespace Helm release name/namespace annotations and managed-by label. |
| Backend waits for migrations | Migration Job logs, database login/schema permissions, DNS, TLS mode and provider network allowlist. |
| `ImagePullBackOff` or wrong architecture | Image/tag exists, matches the node architecture, and has a pull Secret in the correct namespace. |
| Worker `Pending` or quota rejection | Pod events, node capacity, runner requests and `workers.quota`. Persistent startup failures are reported after a two-minute grace period. |
| Runner cannot provision | Chart Role/RoleBinding grants backend access to Jobs, Pods, events and run Secrets in the configured worker namespace. |
| Storage or session restore fails | Bucket/key permissions, signing region, addressing mode, endpoint reachability and matching backend/worker versions. |
| Sign-in or media fails | HTTPS certificate, matching `publicUrl`/host, browser-reachable public storage endpoint and bucket CORS. |
| Worker cannot call backend/model/Git | Cluster DNS, Service connectivity, private-destination egress rules and any additional cluster policies. |

## Upgrades, backups and removal

Back up PostgreSQL, the object bucket, both encryption keys and installation configuration. Test restoring them together. For an upgrade, check out the matching chart revision, update all image tags in your values, then repeat the Helm install command. Existing Jobs keep their original images; preserve callback compatibility while they finish. Secret changes need a backend restart to refresh environment values:

```bash
kubectl -n viberglass rollout restart deployment/viberglass-backend
kubectl -n viberglass rollout status deployment/viberglass-backend
```

Helm rollback does not reverse database migrations. For upgrades from older experimental workers, deploy matching backend and worker images, then remove obsolete worker storage Secrets after old runs finish. See [deployment operations](../../kubernetes-deployment.md) for backup/restore details and migration limitations.

To remove the installation, first stop/cancel active runs and preserve needed data. This deletes the worker namespace and its Jobs:

```bash
helm uninstall viberglass --namespace viberglass
```

The app namespace and manually supplied Secrets remain. External PostgreSQL, object storage, DNS and certificates managed outside Helm remain; their cleanup is separate. Provider networking, NetworkPolicy enforcement, backup recovery and real-model behavior need validation on your own cluster; local runtime tests do not certify those services.

## Build your own images

From the source revision you intend to deploy, use a registry you can push to and a unique immutable tag. This example builds OpenCode for amd64; choose the platform matching your nodes. A mixed-architecture cluster needs images for each architecture. Registry login uses your normal Docker credential setup.

```bash
VIBERGLASS_REGISTRY=registry.example.com/team
VIBERGLASS_TAG=YOUR_UNIQUE_BUILD_TAG
VIBERGLASS_PLATFORM=linux/amd64
docker buildx build --platform "$VIBERGLASS_PLATFORM" --push \
  -f apps/platform-backend/Dockerfile.prod \
  -t "$VIBERGLASS_REGISTRY/viberglass-backend:$VIBERGLASS_TAG" .
docker buildx build --platform "$VIBERGLASS_PLATFORM" --push \
  -f apps/platform-frontend/Dockerfile.prod \
  -t "$VIBERGLASS_REGISTRY/viberglass-frontend:$VIBERGLASS_TAG" .
docker buildx build --platform "$VIBERGLASS_PLATFORM" --push \
  -f infra/workers/docker/base/base-worker.Dockerfile \
  -t "$VIBERGLASS_REGISTRY/viberator-base-worker:$VIBERGLASS_TAG" .
docker buildx build --platform "$VIBERGLASS_PLATFORM" --push \
  -f infra/workers/docker/generated/opencode.Dockerfile \
  --build-arg "BASE_IMAGE=$VIBERGLASS_REGISTRY/viberator-base-worker:$VIBERGLASS_TAG" \
  -t "$VIBERGLASS_REGISTRY/viberator-worker-opencode:$VIBERGLASS_TAG" .
```

Then set `backend.image` and `frontend.image` to those full references, `workers.registry` to `registry.example.com/team`, and `workers.imageTag` to your build tag. Build additional worker images using their catalog `dockerfilePath` and `repositoryName`; Claude Code uses `infra/workers/docker/viberator-worker-multi-agent.Dockerfile`, rather than a generated `claude-code.Dockerfile`. Configure pull Secrets if the registry is private, then continue at [namespace creation](#2-create-namespaces).
