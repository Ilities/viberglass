# Upgrades and backups

How to update an installation, and what to back up so you can restore it. In every setup, the backend runs any new database migrations when it starts.

## What to back up

- The PostgreSQL database: people, spaces, tasks, threads, plans, runners and encrypted secrets.
- The encryption keys, `SECRETS_ENCRYPTION_KEY` and `WEBHOOK_SECRET_ENCRYPTION_KEY`. A database restored without them can't read its secrets.
- Object storage, on Kubernetes and AWS: task media, documents, agent instructions and saved agent conversations.

Keep the keys apart from the database backups, somewhere as safe as the rest of your credentials.

## Docker on your machine

Update:

```bash
git pull
docker compose up --build
```

Back up the database:

```bash
docker exec viberglass-dev-postgres pg_dump -U jussi -d viberglass-platform -Fc > viberglass.dump
```

The database lives in the `viberglass-postgres-data` Docker volume. Task media and saved agent conversations are kept on the host under `~/.viberglass/media` and `~/.viberglass/session-state`; back them up together with the database. Set `VIBERGLASS_DATA_DIR` in the root `.env` to keep them somewhere else. Docker creates these folders as root, so use `sudo` to copy or remove them.

## Docker on a server

For the [production setup](install-docker.md#on-a-server), back up first:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U viberglass -d viberglass -Fc > viberglass.dump
```

Copy `/var/lib/viberglass` (or your `VIBERGLASS_DATA_DIR`) and `.env` with it. Then set `VIBERGLASS_VERSION` in `.env` to the new release and update:

```bash
docker compose -f docker-compose.prod.yml --profile https pull
docker compose -f docker-compose.prod.yml --profile https up -d
```

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

Update the stacks with `pulumi up` in order (base, platform, workers), push new worker images to ECR, and deploy the new backend. To run migrations by hand:

```bash
./apps/platform-backend/scripts/run-migrations.sh prod --dry-run
./apps/platform-backend/scripts/run-migrations.sh prod
```

Check that an RDS backup exists before migrating production. RDS keeps automated backups; the uploads bucket holds media and saved conversations.

## Worker images

Worker images come from `ghcr.io/ilities` on Docker and Kubernetes unless you build your own, and from ECR on AWS. The public images are published on every change to them on `main` and on releases, tagged `latest`, the commit and the release. On Kubernetes, set `workers.imageTag` to the tag you want, so upgrades happen when you choose.
