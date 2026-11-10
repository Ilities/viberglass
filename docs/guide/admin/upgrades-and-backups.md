# Upgrades and backups

How to update an installation, and what to back up so you can restore it. In every setup, the backend runs any new database migrations when it starts.

## What to back up

- The PostgreSQL database: people, spaces, tasks, threads, plans, runners and encrypted secrets.
- The encryption keys, `SECRETS_ENCRYPTION_KEY` and `WEBHOOK_SECRET_ENCRYPTION_KEY`. A database restored without them can't read its secrets.
- Object storage, on Kubernetes and AWS, and on Docker when a bucket is set: task media, documents, agent instructions, saved agent conversations, the files and artifacts of Files spaces, and apps' data, backups and releases.

Keep the keys apart from the database backups, somewhere as safe as the rest of your credentials.

## Apps

An App space's app keeps its data in object storage, not in the database: its SQLite database is copied there continuously, under `spaces/<space id>/app-data/`, with data backups under `spaces/<space id>/backups/` and its releases under `spaces/<space id>/releases/`. On Docker on your machine that's the bundled MinIO's volume. Back up the bucket with the database. Each app's code is in its own repository on the code host. See [Apps](apps.md) for how long data backups are kept.

## Docker on your machine

Update:

```bash
git pull
docker compose pull
docker compose up -d
```

Back up the database:

```bash
docker compose exec -T postgres pg_dump -U viberglass -d viberglass -Fc > viberglass.dump
```

The database lives in the `viberglass-local_postgres-data` Docker volume. Task media, plan documents and the files of Files spaces are in the bundled object storage, in the `viberglass-local_storage-data` volume. Saved agent conversations, instruction files and skills are kept on the host under `~/.viberglass`; back them up together with the database. Set `VIBERGLASS_DATA_DIR` in the root `.env` to keep them somewhere else. On Linux, Docker creates these folders as root, so use `sudo` to copy or remove them. Task media are also written to `~/.viberglass/media`, which agent containers mount. Some media exist only in that folder, so back it up too and don't remove it.

## Docker on a server

For the [production setup](install-docker.md#on-a-server), back up first:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U viberglass -d viberglass -Fc > viberglass.dump
```

Copy `/var/lib/viberglass` (or your `VIBERGLASS_DATA_DIR`) and `.env` with it, and the bucket if you set one. Then set `VIBERGLASS_VERSION` in `.env` to the new release and update:

```bash
docker compose -f docker-compose.prod.yml --profile https pull
docker compose -f docker-compose.prod.yml --profile https up -d
```

The worker images take the same tag unless `VIBERATOR_WORKER_IMAGE_TAG` is set. Start each agent again to pull its new image; see [Worker images](#worker-images).

## Kubernetes

Set the new release tag on the backend, frontend and worker images in your values file, and run the same `helm upgrade --install` command with `--wait --wait-for-jobs`. The migration Job runs before the new backend starts. Runs already in progress keep their image and finish.

A Helm rollback restores the previous Deployment, but doesn't undo database migrations. Back up the database before upgrading, and restore it if a rollback needs the old schema.

For managed PostgreSQL, turn on the provider's backups and point-in-time recovery. For the bundled PostgreSQL:

```bash
kubectl -n viberglass exec viberglass-postgres-0 -- pg_dump -U viberglass -d viberglass -Fc > viberglass.dump
```

Copy the storage bucket alongside it. To restore, load the dump into a fresh database, keep the same encryption keys, and point the backend at the restored database and bucket. Check that sign-in, secrets, documents and a resumed task work before switching over.

Details are in [Kubernetes deployment and operations](https://github.com/Ilities/viberglass/blob/main/docs/kubernetes-deployment.md#upgrade-rollback-and-capacity).

## AWS

Update the stacks with `pulumi up` in order (base, workers, platform), push a new Lambda worker image to ECR if you use Lambda runners, and deploy the new backend. To run migrations by hand:

```bash
./apps/platform-backend/scripts/run-migrations.sh prod --dry-run
./apps/platform-backend/scripts/run-migrations.sh prod
```

Check that an RDS backup exists before migrating production. RDS keeps automated backups; the uploads bucket holds media, saved conversations and the files of Files spaces.

## Worker images

Worker images come from `ghcr.io/ilities` on Docker, Kubernetes and ECS unless you build your own. Lambda runners use the image you push to ECR. The public images are published on every change to them on `main` and on releases, tagged `latest`, the commit and the release. Pin a tag so upgrades happen when you choose:

- AWS: set `workerImageTag` in the platform stack, run `pulumi up` there and deploy the backend. With `workerImageRegistry: ecr` the tag must exist in your ECR.
- Docker: set `VIBERATOR_WORKER_IMAGE_TAG` in the `.env` file next to the compose file and restart the backend.
- Kubernetes: set `workers.imageTag` in your values file and run `helm upgrade`.

Agents on the published images follow the installation's registry and tag. An agent stays on an image only when someone set one on it: Container Image on Docker and Kubernetes, or `containerImage` and `imageUri` in its deployment config. With `latest`, an agent on Docker keeps the copy it pulled, so pin a tag. After the tag changes:

- Kubernetes: the next run starts from the new tag.
- Docker: the agent shows as Not running, and its page says the new image isn't on the host yet. Start it again to pull it. Agents started together pull one image at a time. Images of the previous release stay on the host; list them with `docker image ls 'ghcr.io/ilities/viberator-*'` and remove the old tags with `docker image rm`.
- ECS: the agent shows as Not running while its task definition runs another image. Starting it registers a new task definition with the new image.
- Lambda: the agent shows as Not running while its function runs another image than `VIBERATOR_LAMBDA_IMAGE_URI`. Starting it updates the function. A Lambda image pushed again under the same tag, such as `latest`, isn't noticed, so start Lambda agents again after pushing one.

The agent's page shows the image its runs start from.
