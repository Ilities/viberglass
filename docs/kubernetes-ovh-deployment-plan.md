# Kubernetes deployment, validated on OVHcloud

## Goal and boundary

Add a deployable European cloud path for Viberglass using Kubernetes as the compute interface and OVHcloud Managed Kubernetes Service (MKS) as the first documented implementation. Keep Docker and AWS deployments working. A Kubernetes Job runs each agent execution; the backend and Next.js frontend run as long-lived workloads. PostgreSQL, object storage, email, and DNS are deployment dependencies, not Kubernetes-specific application features.

This plan uses OVHcloud to validate a reusable Kubernetes distribution. It does not require every service to come from OVHcloud. In particular, verify the managed PostgreSQL offering, region, network access, backup options, and price for the selected OVHcloud account before locking the deployment template. A compatible external PostgreSQL service remains a valid choice. Avoid presenting a cluster as a zero-cost abstraction: worker nodes, load balancers, persistent volumes, database, storage, traffic, and backups are billed separately even when the control plane is included.

## Target shape

```text
Internet -> ingress/TLS -> Next.js frontend -> platform backend
                                      backend -> PostgreSQL
                                      backend -> S3-compatible object storage
                                      backend -> Kubernetes API -> one Job per worker run
                                      backend -> SMTP email service
                                      Job -> platform callbacks, Git host, object storage
```

Use one cluster for the backend, frontend, and Jobs initially, with separate node pools or resource quotas only when usage justifies them. The control plane is managed by OVHcloud; the paid worker nodes supply capacity for the services and Jobs. One worker Job must not be able to access other tenants' credentials merely by reading a shared Secret. The backend remains the authority for tenant-scoped credentials and issues a short-lived callback/bootstrap token to each Job.

## Work packages, in implementation order

### 1. Define the compute contract (started in this branch)

- Add `kubernetes` to `ClankerStrategyType` and a `KubernetesStrategyConfig` in [`packages/types/src/clankerConfig.ts`](../packages/types/src/clankerConfig.ts). Keep the first configuration small: prebuilt image, namespace, CPU, memory, temporary disk, and a Job deadline. Cluster authentication belongs to the backend deployment, not a Clanker record.
- Add a dedicated normalizer in [`apps/platform-backend/src/clanker-config/strategies/`](../apps/platform-backend/src/clanker-config/strategies), route both V1 and legacy records through it in [`index.ts`](../apps/platform-backend/src/clanker-config/index.ts) and [`legacyMapper.ts`](../apps/platform-backend/src/clanker-config/legacyMapper.ts), and include the image in [`resolveComputeImage.ts`](../apps/platform-backend/src/clanker-config/resolveComputeImage.ts).
- Test a V1 config and a legacy strategy record. **Exit:** `kubernetes` stays `kubernetes` after normalization, the image resolves correctly, and malformed optional fields are discarded. This is a contract only; selecting it must remain unavailable until the invoker and storage paths are ready.

### 2. Make one Job executable end to end

- Add `kubernetes` to [`WorkerType`](../apps/platform-backend/src/workers/WorkerInvoker.ts) and implement `KubernetesInvoker` beside [`EcsInvoker`](../apps/platform-backend/src/workers/invokers/EcsInvoker.ts). Register it in [`WorkerInvokerFactory`](../apps/platform-backend/src/workers/WorkerInvokerFactory.ts). Use the official Kubernetes JavaScript client with in-cluster service account credentials; allow kubeconfig for local integration tests. Build a `batch/v1` Job with the selected prebuilt worker image, unique name and labels for job/tenant IDs, `restartPolicy: Never`, resource requests/limits, `activeDeadlineSeconds`, `backoffLimit: 0`, and `ttlSecondsAfterFinished`. Never put tenant secrets in command arguments or Job metadata.
- Pass the existing bootstrap payload contract to the worker, adding a `KubernetesPayload` variant to [`apps/viberator/src/workers/core/types.ts`](../apps/viberator/src/workers/core/types.ts). Update the CLI acceptance check in [`cli-handler.ts`](../apps/viberator/src/workers/entrypoints/cli-handler.ts) and remote instruction handling in [`InstructionFileManager.ts`](../apps/viberator/src/workers/runtime/InstructionFileManager.ts). The worker image and startup command come from the existing worker build path in [`infra/workers/docker/`](../infra/workers/docker), not a new runtime.
- Add a Kubernetes stopper beside [`DockerWorkerStopper`](../apps/platform-backend/src/workers/stoppers/DockerWorkerStopper.ts). Derive a stable Job name from the run ID so retries and cancellation find the same Job; record that name as `executionId` through [`WorkerExecutionService`](../apps/platform-backend/src/workers/WorkerExecutionService.ts). Extend [`OrphanSweeper`](../apps/platform-backend/src/workers/OrphanSweeper.ts) to reconcile Jobs that disappear, fail, or expire so runs cannot remain active forever.
- Unit test manifest construction, duplicate submission, permission errors, cancellation, and terminal state mapping. Run a real worker against a disposable local Kubernetes cluster (kind or k3d). **Exit:** one job runs, calls back, completes, and can be cancelled; an existing AWS/Docker smoke test still passes.

### 3. Make storage and credentials portable

- [`InstructionStorageService`](../apps/platform-backend/src/services/instructions/InstructionStorageService.ts), [`FileUploadService`](../apps/platform-backend/src/services/FileUploadService.ts), [`ConfigLoader`](../apps/viberator/src/workers/infrastructure/ConfigLoader.ts), and [`SessionStateManager`](../apps/viberator/src/workers/runtime/SessionStateManager.ts) use AWS SDK S3 clients and AWS defaults. Configure one S3-compatible endpoint, region, bucket, and credentials for OVHcloud Object Storage; preserve `s3://` object references initially. Test path-style/URL behavior, presigned URLs, uploads, downloads, deletion, and conversation-state restoration against the chosen endpoint. Keep an adapter boundary if provider behavior diverges.
- [`CredentialProviderFactory`](../apps/platform-backend/src/credentials/CredentialProviderFactory.ts) already supports environment, file, and SSM; [`CredentialProvider`](../apps/viberator/src/workers/infrastructure/CredentialProvider.ts) still falls back to SSM. Decide how tenant secrets are stored and fetched in production: a database-backed encrypted provider or another audited secret store, with backend-mediated worker bootstrap. Mount only platform-level credentials using Kubernetes Secrets or an external secrets controller. Do not give a worker access to a cluster-wide Secret containing all tenants' values.
- [`TicketMediaExecutionService`](../apps/platform-backend/src/services/TicketMediaExecutionService.ts) and worker media access also need a real upload/download test against OVHcloud storage. **Exit:** a job can read instructions and ticket media, use its own credentials, and resume a session without AWS credentials.

### 4. Expose Kubernetes in the product safely

- Insert a `kubernetes` deployment strategy in a new migration under [`apps/platform-backend/src/migrations/`](../apps/platform-backend/src/migrations); do not rewrite migration 004. Update [`ClankerDAO`](../apps/platform-backend/src/persistence/clanker/ClankerDAO.ts) and [`InstructionStrategyType`](../apps/platform-backend/src/services/instructions/InstructionStorageService.ts) so instructions take the hosted object-storage path. Add a provisioning handler to [`ProvisioningStrategyResolver`](../apps/platform-backend/src/provisioning/ProvisioningStrategyResolver.ts) and the existing provisioning orchestrator. The first handler should validate access, namespace and image and report availability; it need not build images automatically.
- Extend the strategy form and validation under [`apps/platform-frontend/src/pages/clankers/config/`](../apps/platform-frontend/src/pages/clankers/config) and the setup default type in [`packages/types/src/setup.ts`](../packages/types/src/setup.ts). Show Kubernetes only when the backend reports the invoker/storage path configured. Keep Docker/ECS/Lambda records unchanged.
- Test create/update/read round trips, instruction storage selection, provisioning status, and frontend form behavior. **Exit:** an operator can select a Kubernetes Clanker and launch a job through the normal UI/API without manually editing database rows.

### 5. Package the platform for Kubernetes

- Add a chart or Kustomize overlay under `infra/kubernetes/` for backend, Next.js frontend, ingress/TLS, config, service accounts, namespaces, network policies, resource limits, startup/readiness probes, and migration Job. Use the existing [`apps/platform-backend/Dockerfile.prod`](../apps/platform-backend/Dockerfile.prod); add or adapt a production frontend image if needed. Publish multi-architecture images only if the selected OVH nodes require it.
- Give the backend service account namespaced rights to create/get/list/watch/delete Jobs and inspect Pods. Workers get no Kubernetes API rights. Use a distinct namespace or tightly bounded namespace configuration and per-Job labels; reject arbitrary namespace values outside the configured allowlist. Define CPU/memory/temporary-disk defaults and quotas before enabling user-selected overrides.
- Put deployment values in a documented example, not plaintext credentials. **Exit:** a fresh cluster installs cleanly and survives a backend/frontend rolling update while running Jobs continue.

### 6. Add OVHcloud infrastructure and operations

- Add a separate Pulumi stack under `infra/` rather than mixing OVH resources into [`infra/platform/index.ts`](../infra/platform/index.ts). Provision MKS, worker node pool, network, object storage bucket, registry access, and optional managed PostgreSQL where the OVH/Pulumi APIs support the required product. Use the Kubernetes provider or Helm for cluster resources. Document any manual steps clearly, especially DNS, database allowlisting/private connectivity, SMTP, and secrets.
- Add runbooks for first install, migrations, backups/restore, scaling, certificate renewal, upgrades, rollback, job cleanup, and cost controls. Observe Kubernetes events, Job status, backend logs, and worker callback failures; keep the current telemetry path if an OTLP endpoint is configured.
- **Exit:** install from an empty OVHcloud project, run a real repository task, cancel it, restore a backup, and remove the stack without orphaning billable resources.

### 7. Validate portability

- Run the same chart and worker integration tests on a non-OVH Kubernetes cluster. This is where OVH-specific assumptions should be found. Keep provider-specific behavior in Pulumi and endpoint configuration; keep the Job invoker and product model provider-neutral.
- Compare a small always-on deployment and bursty worker load with AWS, Hetzner, and OVHcloud using current published prices at decision time. Include nodes (including idle capacity), load balancer, managed PostgreSQL, object storage/egress, backups, and operational time. **Exit:** installation docs show exact prerequisites and the tested versions, and at least one non-OVH cluster passes the workload smoke test.

## Main risks and decisions

1. **Credentials:** worker-side SSM lookup is the biggest AWS coupling in the execution path. Choose and test tenant-scoped secret delivery before exposing Kubernetes to users.
2. **Object storage:** S3 API compatibility helps but endpoint, signing, and presigned URL behavior must be exercised with the actual OVHcloud service.
3. **Job lifecycle:** callback loss, pod eviction, TTL cleanup, and retries need explicit reconciliation to avoid stuck or duplicate jobs.
4. **Next.js deployment:** confirm build-time and runtime environment variables and whether any current frontend path assumes Amplify features; package a regular container behind ingress.
5. **Capacity and isolation:** size the node pool for the backend/frontend baseline plus worker bursts; set per-Job limits and quotas before allowing user-controlled resource fields.

## Implementation status and configuration

The config contract and Job execution are implemented: dispatch, retries, cancellation, worker payload support, and reconciliation of failed, missing, or completed Jobs without callbacks. Reconciliation uses a conditional status update to protect a successful callback arriving concurrently. Product selection, portable tenant credentials and OVHcloud storage remain in work packages 3–4.

A real fake-agent worker passed a disposable kind v0.33.0 / Kubernetes v1.37.0 smoke test: bootstrap retrieval, repository clone, result callback, Job completion, duplicate submission, and cancellation. The image used a cached worker base with the compiled code from this branch overlaid. This validates local Kubernetes execution; OVHcloud installation and an AWS/Docker deployment smoke remain outstanding. Focused regression tests cover existing execution and cancellation orchestration.

The reusable runner is `npm run smoke:kubernetes -w @viberglass/platform-backend`. Set `KUBECONFIG`, `KUBERNETES_WORKER_NAMESPACE`, `KUBERNETES_SMOKE_IMAGE` (a fake-agent worker image available to the cluster), and `KUBERNETES_SMOKE_HOST` (the host address reachable from Pods). Use a disposable cluster. The runner starts a temporary repository and callback server, creates and deletes its Jobs, and removes its repository fixture.

For this slice, set `KUBERNETES_WORKER_NAMESPACE` and a worker-reachable `PLATFORM_API_URL` on the backend. A Clanker needs a prebuilt `containerImage`; its optional namespace must equal the backend's configured namespace. The client uses the backend's in-cluster service account or local kubeconfig. Grant that identity namespaced `create`, `get`, and `delete` permissions on Jobs. Worker Pods disable service account token mounting.

`KUBERNETES_WORKER_ENV_SECRET` optionally names an existing Secret for platform-level worker environment values. It must not contain other tenants' agent or SCM credentials. The per-run callback token is currently a Pod environment value, so access to Job/Pod specifications must be restricted. The worker fetches the task payload through `--job-ref`; tenant credential delivery and non-AWS object storage are still to be implemented and validated.
