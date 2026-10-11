# Portable storage and worker credentials

Kubernetes workers retrieve credentials from the backend through their run's authenticated bootstrap endpoint. The backend's existing Secrets feature supports encrypted PostgreSQL storage and environment references; workers need no SSM permissions. The Helm distribution includes Kubernetes selection, provisioning, and local installation.

For runnable local verification and the full-installation gaps, see [local Kubernetes](local-kubernetes.md).

## Backend secrets

Set `SECRETS_ENCRYPTION_KEY` to a persistent, strong secret on the backend, then create credentials using **database** storage in the existing Secrets UI/API. Attach each secret to the runner using `secretBindings: [{ envVar, secretId }]`. Labels can be duplicated; the binding selects the exact secret. Database values use the existing AES-256-GCM encryption. Keep the encryption key available when restoring the database; changing it without re-encrypting existing values makes those values unreadable.

The existing secret catalog belongs to the installation and has no separate tenant column. The new delivery boundary is the stored run's credential allowlist, authenticated callback token, and tenant binding. It does not add a new multitenant secret catalog. The backend records credential requests and the exact secret bindings for the run. Bootstrap resolves only those bindings and returns values keyed by the requested environment variables; callers cannot select credentials. Missing required secrets fail bootstrap. Secret values are added to the response in memory, not saved in job bootstrap data or placed in Kubernetes specifications.

Credential retrieval is allowed while the Kubernetes run is active. Terminal runs are refused. Use TLS for the worker-facing backend endpoint. The callback token is mounted from a run-specific, immutable Kubernetes Secret and is absent from Job/Pod specifications. Restrict Secret access and Pod execution permissions; those can still expose a mounted token.

Codex device-login credentials use the same delivery path. Connect the runner to a ChatGPT account using its login action. The backend stores a separate encrypted login per runner and links it through `codexAuth.loginSecretId`; `workerBindings` injects that login as a worker-only credential, never an agent-visible variable. The first login can start without a stored cache. A missing linked login fails bootstrap. Refresh callbacks accept only an active run's requested auth variable and update its runner's login. Kubernetes stores new logins in the encrypted database; AWS retains its configured secret storage. Existing SSM secrets should be migrated to database storage before using the deployment without AWS access.

## Object storage

Configure the following on the backend and AWS/Docker worker deployments. Kubernetes workers use backend-authorized URLs and receive no S3 credential environment. Read the endpoint and signing region from the storage provider's configuration for the selected bucket; they must be reachable from workers and browsers that use signed media URLs.

| Variable | Meaning | Default/fallback |
| --- | --- | --- |
| `S3_ENDPOINT` | S3-compatible HTTP(S) endpoint, without embedded credentials | AWS SDK endpoint |
| `S3_REGION` | Signing region | `AWS_REGION`, then `eu-west-1` |
| `S3_BUCKET` | Media, documents, and session archive bucket | `AWS_S3_BUCKET` |
| `INSTRUCTION_FILES_S3_BUCKET` | Optional separate instruction bucket | `S3_BUCKET`, then `AWS_S3_BUCKET` |
| `S3_FORCE_PATH_STYLE` | `true` for `/bucket/key`, `false` for virtual host addressing | SDK default |
| `S3_ACCESS_KEY_ID` | Object storage access key | SDK credential chain if both S3 keys are unset |
| `S3_SECRET_ACCESS_KEY` | Object storage secret key; set together with access key | SDK credential chain |
| `S3_PUBLIC_ENDPOINT` | Browser-reachable endpoint for signed downloads; workers use `S3_ENDPOINT` | `S3_ENDPOINT` |
| `S3_SESSION_TOKEN` | Optional token for temporary S3 credentials | Unset |

The neutral S3 variables let an OVH signing region coexist with an AWS region used by other clients. Existing AWS configuration continues to work without setting any new variables. Standard AWS SDK checksum environment settings also remain available; see [AWS checksum configuration](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html).

Backend and worker storage clients use the same resolver in `packages/types/src/objectStorage.ts`. Stored references remain `s3://bucket/key`. Media download URLs are signed against the configured endpoint. The bucket must already exist and allow the required object operations. Uploads do not provision buckets.

Kubernetes workers authenticate `POST /api/jobs/:jobId/storage-url` with the run's callback token and tenant. Reads are limited to exact instruction/media/prior-session references in the stored bootstrap payload. Writes are limited to one backend-selected archive key for the run; conversation-state callbacks cannot choose another run's archive. URLs expire after sixty seconds and continue working for that short window if a run is cancelled after authorization. Terminal runs cannot request more URLs. The underlying storage endpoint must be reachable from worker Pods.

`KUBERNETES_WORKER_ENV_SECRET` is optional and reads only `OTEL_EXPORTER_OTLP_HEADERS`; it no longer imports arbitrary values or storage credentials. The Helm chart supplies namespace boundaries and network policies; policy enforcement requires a compatible CNI.

## Verification and remaining work

`npm run smoke:portable -w @viberglass/platform-backend` creates disposable MinIO and PostgreSQL containers using Docker. It checks encrypted database secrets, credential selection, Codex auth-cache storage, instruction upload/download/delete, media presigning/download/delete, and session capture/restore. Session archives exclude agent auth files. Containers and temporary files are removed afterwards.

The smoke runner uses MinIO and confirms application compatibility with a real alternative S3 server. It has not been run against OVHcloud. Before declaring the OVH deployment supported, run the same storage flows against the chosen service, including browser download/CORS behavior, DNS/TLS, least-privilege bucket policies, and a resumed real agent turn.

AWS/Docker storage fallback behavior is retained. Kubernetes session storage uses scoped URLs and does not return a local-file fallback after a failed upload; local files would not survive the next Pod. A failed upload or restore is reported in the worker log and the existing session flow can continue without archived state. OVHcloud storage/network certification remains outstanding.
