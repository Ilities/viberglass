# Portable storage and worker credentials

Kubernetes workers retrieve credentials from the backend through their run's authenticated bootstrap endpoint. The backend's existing Secrets feature supports encrypted PostgreSQL storage and environment references; workers need no SSM permissions. This path is implemented, but Kubernetes product selection, provisioning, and deployment manifests are still pending.

For runnable local verification and the full-installation gaps, see [local Kubernetes](local-kubernetes.md).

## Backend secrets

Set `SECRETS_ENCRYPTION_KEY` to a persistent, strong secret on the backend, then create credentials using **database** storage in the existing Secrets UI/API. Attach the needed secret IDs to the Clanker. Database values use the existing AES-256-GCM encryption. Keep the encryption key available when restoring the database; changing it without re-encrypting existing values makes those values unreadable.

The existing secret catalog belongs to the installation and has no separate tenant column. The new delivery boundary is the stored run's credential allowlist, authenticated callback token, and tenant binding. It does not add a new multitenant secret catalog. Only the required secret names recorded by the backend are resolved; bootstrap does not accept credential names from the caller. Missing required secrets fail bootstrap. Secret values are added to the response in memory, not saved in job bootstrap data or placed in Kubernetes specifications.

Credential retrieval is allowed while the Kubernetes run is active. Terminal runs are refused. Use TLS for the worker-facing backend endpoint. Restrict Job/Pod access because the run's callback token is an environment value in its Pod specification.

Codex device-login credentials use the same delivery path. Select the configured auth-cache secret name; the credential requirements service adds it to the run's allowlist. An absent Codex auth cache is optional so the first device login can create it. Other missing required secrets fail bootstrap. A Kubernetes worker's refresh callback writes the auth cache to encrypted database storage and accepts only a name in that run's allowlist. AWS runs retain the existing SSM write path. Existing SSM secrets should be migrated to database storage before using the deployment without AWS access.

## Object storage

Configure the following on the backend and worker deployments. Read the endpoint and signing region from the storage provider's configuration for the selected bucket; they must be reachable from workers and browsers that use signed media URLs.

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

Mount storage environment values using `KUBERNETES_WORKER_ENV_SECRET`; give workers the required storage access. Keep agent credentials and backend database/encryption keys out of this Secret. Current workers have direct bucket access; this change does not add per-run object access policies. The Helm chart supplies namespace boundaries and network policies; policy enforcement requires a compatible CNI.

## Verification and remaining work

`npm run smoke:portable -w @viberglass/platform-backend` creates disposable MinIO and PostgreSQL containers using Docker. It checks encrypted database secrets, credential selection, Codex auth-cache storage, instruction upload/download/delete, media presigning/download/delete, and session capture/restore. Session archives exclude agent auth files. Containers and temporary files are removed afterwards.

The smoke runner uses MinIO and confirms application compatibility with a real alternative S3 server. It has not been run against OVHcloud. Before declaring the OVH deployment supported, run the same storage flows against the chosen service, including browser download/CORS behavior, DNS/TLS, least-privilege bucket policies, and a resumed real agent turn.

Existing storage fallback behavior is retained: media uploads can keep a local disk copy after upload failure, and failed session uploads can fall back to local files. Local fallback files are not durable across Kubernetes worker Pods. Monitor storage failures; a working object storage configuration is required for durable session continuation. Storage authorization isolation, fail-fast provisioning checks, UI selection, and installation manifests are subsequent work packages.
