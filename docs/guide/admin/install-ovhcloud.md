# Install on OVHcloud

Viberglass on OVHcloud Managed Kubernetes Service (MKS), with OVHcloud's managed PostgreSQL and Object Storage. Each agent run is a Kubernetes Job. [Install on Kubernetes](install-kubernetes.md) explains each setting; this page says what to choose on OVHcloud.

## Before you start

You need:

- An OVHcloud Public Cloud project, with permission to create Kubernetes clusters, databases and Object Storage in it.
- A domain whose DNS you control, for two hostnames: the app and artifact previews. The examples use `viberglass.example.com` and `preview.viberglass.example.com`.
- On your machine: Git, kubectl, Helm 3, the AWS CLI v2 (for Object Storage) and OpenSSL.
- A release of Viberglass whose images are published, such as `v1.0.2`.
- A model key and a GitHub repository with a fine-grained token, as in [first-run setup](install-docker.md#first-run-setup).

Use one region for everything. The examples use Gravelines: `GRA9` for the cluster, `gra` for Object Storage.

```bash
VIBERGLASS_TAG=v1.0.2
OVH_S3_REGION=gra
OVH_S3_ENDPOINT=https://s3.$OVH_S3_REGION.io.cloud.ovh.net
VIBERGLASS_BUCKET=viberglass   # the bucket you create in step 1
VIBERGLASS_INSTALL_DIR="$HOME/viberglass-ovh"
install -d -m 700 "$VIBERGLASS_INSTALL_DIR"
git clone https://github.com/Ilities/viberglass.git
cd viberglass
git checkout "$VIBERGLASS_TAG"
```

## 1. Create the bucket

1. In the project, open Storage → Object Storage → Create a container. Name it `viberglass`, choose the S3 API, Standard storage and your region. Bucket names are global across OVHcloud; if `viberglass` is taken, choose another name and set `VIBERGLASS_BUCKET` to it. Every command below uses that variable.
2. Under User, choose Create a user, or pick an existing user with the Administrator or Object Storage Operator role. Then choose View credentials and copy the S3 access key and secret key.
3. Finish the wizard. Keep the bucket private.

Keep the keys in an AWS CLI profile of their own, so the commands below don't touch any AWS account:

```bash
aws configure --profile ovh
# The access key and secret key from step 2, region: gra, output: json
```

Browsers download task media from the bucket through signed links. Allow the app's origin to read:

```bash
cat > "$VIBERGLASS_INSTALL_DIR/cors.json" <<'EOF'
{"CORSRules": [{"AllowedOrigins": ["https://viberglass.example.com"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600}]}
EOF
aws --profile ovh --endpoint-url "$OVH_S3_ENDPOINT" s3api put-bucket-cors \
  --bucket "$VIBERGLASS_BUCKET" --cors-configuration "file://$VIBERGLASS_INSTALL_DIR/cors.json"
```

Check that the keys can write and delete:

```bash
echo ok > /tmp/viberglass-probe
aws --profile ovh --endpoint-url "$OVH_S3_ENDPOINT" s3 cp /tmp/viberglass-probe "s3://$VIBERGLASS_BUCKET/probe"
aws --profile ovh --endpoint-url "$OVH_S3_ENDPOINT" s3 rm "s3://$VIBERGLASS_BUCKET/probe"
```

## 2. Create the cluster

In the project, open Managed Kubernetes Service → Create a cluster:

- Region `GRA9`, plan Free.
- The latest Kubernetes version offered.
- No private network. The nodes reach the database over its public address, allowed by IP in the next step.
- A node pool of 2 nodes, flavor `b3-16` (4 vCPU, 16 GB), autoscaling off: the database only accepts the nodes it lists, so new nodes would be refused until added.

Each agent run asks for 1 CPU and 4 GiB, and the backend and frontend need little next to that, so two such nodes fit the app and five or six concurrent runs.

A new project's vCPU quota may be too small for that, and creating the cluster fails with `InsufficientVCPUsQuota`. Either use 2 × `b3-8` (2 vCPU, 8 GB), which fits the app and two concurrent runs, or raise the quota for the region under Project Management → Quota and Regions.

When the cluster is ready, download its kubeconfig from the cluster's page:

```bash
mv ~/Downloads/kubeconfig.yml "$VIBERGLASS_INSTALL_DIR/kubeconfig"
chmod 600 "$VIBERGLASS_INSTALL_DIR/kubeconfig"
export KUBECONFIG="$VIBERGLASS_INSTALL_DIR/kubeconfig"
kubectl get nodes -o wide
```

Note each node's `EXTERNAL-IP`.

## 3. Create the database

In the project, open Databases → Create a database service:

- PostgreSQL, the newest version offered, plan Essential, one node, region `GRA`, public network.

When it's running, on its page:

1. Authorized IPs: add each node's address from step 2, and your own for checking the connection.
2. Databases: add `viberglass`.
3. Users: add `viberglass`, and copy its password.
4. General information: note the host and port. The port isn't PostgreSQL's usual 5432.

The `viberglass` database belongs to OVHcloud's admin user, `avnadmin`, and since PostgreSQL 15 other users can't create tables in its `public` schema. Let the `viberglass` user create them, connecting as `avnadmin` (its password is on the database's page):

```bash
psql "postgresql://avnadmin@HOST:PORT/viberglass?sslmode=require" \
  -c 'GRANT USAGE, CREATE ON SCHEMA public TO viberglass;'
```

Without this, the install in step 7 fails with `permission denied for schema public`.

## 4. Ingress and certificates

MKS comes without an ingress controller. Install Traefik; its Service gets an OVHcloud Load Balancer with a public address:

```bash
helm repo add traefik https://traefik.github.io/charts
helm repo update
helm upgrade --install traefik traefik/traefik --namespace traefik --create-namespace --wait
kubectl -n traefik get service traefik --watch
```

Wait for `EXTERNAL-IP`, then stop the watch with Ctrl-C. Point both hostnames at that address with A records, at the DNS provider your domain's nameservers belong to (`dig +short NS example.com` shows them, for your own domain). Records in an OVHcloud DNS zone only count if the domain's nameservers are OVHcloud's. Wait until they resolve:

```bash
dig +short viberglass.example.com preview.viberglass.example.com
```

Install cert-manager and a Let's Encrypt issuer. Replace `REPLACE_WITH_YOUR_EMAIL` with a real address: Let's Encrypt refuses addresses at `example.com`, and the certificate is then never issued.

```bash
helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --namespace cert-manager --create-namespace --set crds.enabled=true --wait
kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: REPLACE_WITH_YOUR_EMAIL
    privateKeySecretRef:
      name: letsencrypt-account
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
EOF
```

cert-manager creates the certificate for both hostnames when Viberglass is installed in step 7.

## 5. Namespaces and Secrets

```bash
kubectl create namespace viberglass
kubectl create namespace viberglass-workers
kubectl label namespace viberglass-workers app.kubernetes.io/managed-by=Helm
kubectl annotate namespace viberglass-workers meta.helm.sh/release-name=viberglass meta.helm.sh/release-namespace=viberglass
```

Viberglass reads its passwords and keys from two Kubernetes Secrets. Write each as a small file first.

Generate two encryption keys. Viberglass uses them to encrypt the model keys and tokens you add later:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Create `$VIBERGLASS_INSTALL_DIR/app.env` with the database user's password from step 3 and those two keys:

```bash
DB_PASSWORD=the-viberglass-database-users-password
SECRETS_ENCRYPTION_KEY=the-first-generated-key
WEBHOOK_SECRET_ENCRYPTION_KEY=the-second-generated-key
```

Create `$VIBERGLASS_INSTALL_DIR/storage.env` with the bucket user's keys from step 1:

```bash
S3_ACCESS_KEY_ID=the-access-key
S3_SECRET_ACCESS_KEY=the-secret-key
```

Turn them into the Secrets:

```bash
chmod 600 "$VIBERGLASS_INSTALL_DIR"/*.env
kubectl -n viberglass create secret generic viberglass-app --from-env-file="$VIBERGLASS_INSTALL_DIR/app.env"
kubectl -n viberglass create secret generic viberglass-storage --from-env-file="$VIBERGLASS_INSTALL_DIR/storage.env"
```

Keep `app.env` somewhere safe. Without its two encryption keys, the credentials stored in Viberglass can't be read after a restore.

## 6. Values

Replace the database host and port from step 3, and the hostnames:

```bash
cat > "$VIBERGLASS_INSTALL_DIR/values.yaml" <<EOF
backend:
  image: ghcr.io/ilities/viberglass-backend:$VIBERGLASS_TAG
  replicas: 1
frontend:
  image: ghcr.io/ilities/viberglass-frontend:$VIBERGLASS_TAG
publicUrl: https://viberglass.example.com
workers:
  namespace: viberglass-workers
  registry: ghcr.io/ilities
  imageTag: $VIBERGLASS_TAG
database:
  enabled: false
  host: REPLACE_WITH_DATABASE_HOST
  port: REPLACE_WITH_DATABASE_PORT
  name: viberglass
  user: viberglass
  ssl: true
storage:
  enabled: false
  endpoint: $OVH_S3_ENDPOINT
  publicEndpoint: $OVH_S3_ENDPOINT
  region: $OVH_S3_REGION
  bucket: $VIBERGLASS_BUCKET
  forcePathStyle: true
preview:
  publicUrl: https://preview.viberglass.example.com
ingress:
  enabled: true
  className: traefik
  host: viberglass.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  tls:
    - hosts: [viberglass.example.com, preview.viberglass.example.com]
      secretName: viberglass-tls
networkPolicy:
  enabled: true
  workerExtraEgress: []
EOF
```

## 7. Install

```bash
helm lint infra/kubernetes/chart -f "$VIBERGLASS_INSTALL_DIR/values.yaml"
helm upgrade --install viberglass infra/kubernetes/chart --namespace viberglass \
  -f "$VIBERGLASS_INSTALL_DIR/values.yaml" --wait --wait-for-jobs --timeout 10m
kubectl -n viberglass get pods,jobs,ingress,certificate
```

The certificate shows `READY True` within a couple of minutes. Then:

```bash
curl --fail --show-error https://viberglass.example.com/api/auth/setup-status
curl --show-error --output /dev/null --write-out '%{http_code}\n' https://preview.viberglass.example.com/
```

Expect `{"requiresInitialUser":true}`, then `404` from the preview host. If the migration Job fails, read its log with `kubectl -n viberglass logs job/viberglass-migrate-1 -c migrate`; a timeout there is usually the database's authorized IPs. A failed Job doesn't run again: after fixing the cause, run the `helm upgrade --install` command again, which starts a new one.

## 8. Use it

Open `https://viberglass.example.com`, create the administrator and go through setup. Run the starter task and watch its Job:

```bash
kubectl -n viberglass-workers get jobs,pods --watch
```

Then check:

- An image uploaded to a task opens in the browser, loaded from Object Storage.
- A second request in the same task continues where the first left off.
- Cancelling a running task removes its Job from `viberglass-workers`.
- A Files space's HTML page opens from the preview host.

## Costs

Billed by the hour while they exist: the two nodes (the Free plan's control plane costs nothing), the Load Balancer, the PostgreSQL service, and the bucket by stored GB and outgoing traffic. Check current prices for your region in the console.

## Teardown

```bash
helm uninstall viberglass --namespace viberglass
helm uninstall traefik --namespace traefik   # removes the Load Balancer
helm uninstall cert-manager --namespace cert-manager
aws --profile ovh --endpoint-url "$OVH_S3_ENDPOINT" s3 rb "s3://$VIBERGLASS_BUCKET" --force
```

Then in the console, delete the cluster, the PostgreSQL service and the bucket's user, and check under Network → Load Balancer that none remains. Remove the two DNS records.
