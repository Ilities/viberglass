#!/usr/bin/env python3
"""Build and install the local Helm distribution; reuse existing data and secrets."""
import argparse
import base64
import json
import pathlib
import secrets
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--cluster", default="viberglass-local")
parser.add_argument("--kubeconfig", default="/tmp/viberglass-local.kubeconfig")
parser.add_argument("--namespace", default="viberglass")
parser.add_argument("--release", default="viberglass")
parser.add_argument("--agent", default="opencode", choices=["opencode", "codex", "claude-code", "antigravity", "kimi", "mistral", "pi", "qwen", "fake"])
parser.add_argument("--skip-build", action="store_true")
args = parser.parse_args()
workers_namespace = f"{args.namespace}-workers"
kube = ["kubectl", "--kubeconfig", args.kubeconfig]


def run(command, **kwargs):
    return subprocess.run(command, check=True, cwd=ROOT, **kwargs)


def exists(kind, name, namespace=None):
    command = kube + (["-n", namespace] if namespace else []) + ["get", kind, name]
    return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def create_secret(namespace, name, data):
    if exists("secret", name, namespace):
        return
    resource = {"apiVersion": "v1", "kind": "Secret", "metadata": {"name": name, "namespace": namespace},
                "data": {key: base64.b64encode(value.encode()).decode() for key, value in data.items()}}
    run(kube + ["create", "-f", "-"], input=json.dumps(resource), text=True, stdout=subprocess.DEVNULL)


if not args.skip_build:
    for dockerfile, image in [
        ("apps/platform-backend/Dockerfile.prod", "viberglass-k8s-backend:local"),
        ("apps/platform-frontend/Dockerfile.prod", "viberglass-k8s-frontend:local"),
        ("infra/workers/docker/base/base-worker.Dockerfile", "viberglass-worker-base:kubernetes"),
    ]:
        run(["docker", "build", "-f", dockerfile, "-t", image, "."])
    for agent in set([args.agent, "fake"]):
        run(["docker", "build", "-f", f"infra/workers/docker/generated/{agent}.Dockerfile",
             "--build-arg", "BASE_IMAGE=viberglass-worker-base:kubernetes", "-t", f"viberator-worker-{agent}:local", "."])

clusters = run(["kind", "get", "clusters"], capture_output=True, text=True).stdout.splitlines()
if args.cluster not in clusters:
    run(["kind", "create", "cluster", "--name", args.cluster, "--kubeconfig", args.kubeconfig, "--wait", "120s"])
else:
    config = run(["kind", "get", "kubeconfig", "--name", args.cluster], capture_output=True, text=True).stdout
    pathlib.Path(args.kubeconfig).write_text(config)
    pathlib.Path(args.kubeconfig).chmod(0o600)

images = ["viberglass-k8s-backend:local", "viberglass-k8s-frontend:local",
          f"viberator-worker-{args.agent}:local", "viberator-worker-fake:local",
          "postgres:17-alpine", "cgr.dev/chainguard/minio:latest"]
for image in images:
    if subprocess.run(["docker", "image", "inspect", image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run(["docker", "pull", image])
nodes = json.loads(run(kube + ["get", "nodes", "-o", "json"], capture_output=True, text=True).stdout)
architecture = nodes["items"][0]["status"]["nodeInfo"]["architecture"]
# Export one platform so containerd does not require absent foreign-platform layers.
with tempfile.TemporaryDirectory(prefix="viberglass-images-") as directory:
    archive = str(pathlib.Path(directory) / "images.tar")
    run(["docker", "save", "--platform", f"linux/{architecture}", "-o", archive, *list(dict.fromkeys(images))])
    run(["kind", "load", "image-archive", archive, "--name", args.cluster])

if not exists("namespace", args.namespace):
    run(kube + ["create", "namespace", args.namespace])
if not exists("namespace", workers_namespace):
    resource = {"apiVersion": "v1", "kind": "Namespace", "metadata": {
        "name": workers_namespace, "labels": {"app.kubernetes.io/managed-by": "Helm"},
        "annotations": {"meta.helm.sh/release-name": args.release, "meta.helm.sh/release-namespace": args.namespace}}}
    run(kube + ["create", "-f", "-"], input=json.dumps(resource), text=True)

create_secret(args.namespace, "viberglass-app", {"DB_PASSWORD": secrets.token_hex(24),
              "SECRETS_ENCRYPTION_KEY": secrets.token_hex(32), "WEBHOOK_SECRET_ENCRYPTION_KEY": secrets.token_hex(32)})
create_secret(args.namespace, "viberglass-storage", {"S3_ACCESS_KEY_ID": "viberglass-local", "S3_SECRET_ACCESS_KEY": secrets.token_hex(32)})
storage = run(kube + ["-n", args.namespace, "get", "secret", "viberglass-storage", "-o", "json"], capture_output=True, text=True)
storage_data = {key: base64.b64decode(value).decode() for key, value in json.loads(storage.stdout)["data"].items()}
create_secret(workers_namespace, "viberglass-storage", storage_data)

run(["helm", "upgrade", "--install", args.release, "infra/kubernetes/chart", "--kubeconfig", args.kubeconfig,
     "--namespace", args.namespace, "-f", "infra/kubernetes/chart/values-local.yaml",
     "--set", f"workers.namespace={workers_namespace}", "--wait", "--wait-for-jobs", "--timeout", "10m"])
print(f"Installed. Frontend: kubectl --kubeconfig {args.kubeconfig} -n {args.namespace} port-forward svc/{args.release}-frontend 3100:80")
print(f"Storage: kubectl --kubeconfig {args.kubeconfig} -n {args.namespace} port-forward svc/{args.release}-minio 39000:9000")
print("Open http://localhost:3100 and create the first administrator. Secrets and PVC data are retained on reinstall.")
