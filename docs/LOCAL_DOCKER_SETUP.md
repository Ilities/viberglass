# Local Docker Clanker Setup

Run tickets locally using Docker workers.

## 1. Build worker image

```bash
docker build -f infra/workers/docker/viberator-docker-worker.Dockerfile -t viberator-worker:local .
```

## 2. Start platform

```bash
docker compose up
docker compose exec backend npm run migrate:latest
```

## 3. Create deployment strategy

In the UI at `/clankers`, create a new deployment strategy: type `docker`, status `Active`.

## 4. Create clanker

New clanker with the Docker strategy. Deployment config:

```json
{
  "containerImage": "viberator-worker:local",
  "networkMode": "host",
  "environmentVariables": {
    "PLATFORM_API_URL": "http://host.docker.internal:8888",
    "GITHUB_TOKEN": "ghp_your_token",
    "ANTHROPIC_API_KEY": "sk-ant-your-key"
  }
}
```

> Linux: replace `host.docker.internal` with `172.17.0.1` (verify with `docker network inspect bridge | grep Gateway`)

## 5. Run a ticket

Create a project, create a ticket, click Run, select the clanker.

---

## ECS Clanker (AWS)

If using ECS instead of local Docker, create a deployment strategy (type: `ecs`) and use this deployment config:

```json
{
  "clusterArn": "arn:aws:ecs:eu-west-1:ACCOUNT:cluster/viberator-workers",
  "taskDefinitionArn": "arn:aws:ecs:eu-west-1:ACCOUNT:task-definition/viberator-worker:1",
  "subnetIds": ["subnet-xxx"],
  "securityGroupIds": ["sg-xxx"],
  "launchType": "FARGATE",
  "assignPublicIp": "ENABLED"
}
```

The ECS cluster, task definition, and IAM roles are provisioned by `infra/workers` (Pulumi). Run `pulumi stack output` to get the ARNs. Credentials go in SSM under `/viberator/tenants/{tenantId}/GITHUB_TOKEN` and `ANTHROPIC_API_KEY`.

## Troubleshooting

**Docker socket permission denied** — `sudo usermod -aG docker $USER && newgrp docker`

**Job stuck in running** — Callback can't reach backend. Check `PLATFORM_API_URL` is correct for your OS.

**Container exits immediately** — `docker logs viberator-job-<jobId>`. Usually missing env vars or invalid JSON in deployment config.

**Image not found** — Rebuild: `docker build -f infra/workers/docker/viberator-docker-worker.Dockerfile -t viberator-worker:local .`
