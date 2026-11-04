#!/bin/sh
# Starts a release: fetches its bundle, restores the app's database from its
# replica, then runs the app under Litestream so every write is replicated.
# A preview (VIBERGLASS_DATA_MODE=preview) restores the same way, with
# read-only credentials, and runs without replicating: its data isn't kept.
set -eu

: "${VIBERGLASS_BUNDLE_URL:?}"
: "${VIBERGLASS_BUNDLE_SHA256:?}"
: "${VIBERGLASS_DATA_BUCKET:?}"
: "${VIBERGLASS_DATA_PATH:?}"

APP_DIR=/app
DATABASE=/data/app.db
CONFIG=/tmp/litestream.yml

# A restarted container keeps its files, and by then the bundle's URL may have expired.
if [ "$(cat "$APP_DIR/.viberglass-bundle" 2>/dev/null || true)" != "$VIBERGLASS_BUNDLE_SHA256" ]; then
  find "$APP_DIR" -mindepth 1 -delete
  curl -fsSL --retry 3 -o /tmp/bundle.tar.gz "$VIBERGLASS_BUNDLE_URL"
  echo "$VIBERGLASS_BUNDLE_SHA256  /tmp/bundle.tar.gz" | sha256sum -c - >/dev/null
  tar -xzf /tmp/bundle.tar.gz -C "$APP_DIR"
  rm /tmp/bundle.tar.gz
  echo "$VIBERGLASS_BUNDLE_SHA256" > "$APP_DIR/.viberglass-bundle"
fi

START=$(node -e '
  const manifest = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (typeof manifest.start !== "string" || !manifest.start.trim()) process.exit(1);
  process.stdout.write(manifest.start);
' "$APP_DIR/viberglass.app.json") || { echo "The release has no start command in viberglass.app.json" >&2; exit 1; }
printf '#!/bin/sh\ncd %s\nexec %s\n' "$APP_DIR" "$START" > /tmp/start-app
chmod 755 /tmp/start-app

{
  echo "dbs:"
  echo "  - path: $DATABASE"
  echo "    replica:"
  echo "      type: s3"
  echo "      bucket: $VIBERGLASS_DATA_BUCKET"
  echo "      path: $VIBERGLASS_DATA_PATH"
  if [ -n "${VIBERGLASS_DATA_REGION:-}" ]; then echo "      region: $VIBERGLASS_DATA_REGION"; fi
  if [ -n "${VIBERGLASS_DATA_ENDPOINT:-}" ]; then echo "      endpoint: $VIBERGLASS_DATA_ENDPOINT"; fi
  if [ "${VIBERGLASS_DATA_FORCE_PATH_STYLE:-}" = "true" ]; then echo "      force-path-style: true"; fi
} > "$CONFIG"

# A database already on the volume is newer than its replica.
litestream restore -config "$CONFIG" -no-expand-env -if-db-not-exists -if-replica-exists "$DATABASE"

if [ "${VIBERGLASS_DATA_MODE:-}" = "preview" ]; then
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  exec /tmp/start-app
fi

litestream replicate -config "$CONFIG" -no-expand-env -exec /tmp/start-app &
REPLICATING=$!
trap 'kill -TERM "$REPLICATING" 2>/dev/null || true' TERM INT
STATUS=0
wait "$REPLICATING" || STATUS=$?
# A stop signal ends the first wait while Litestream is still stopping the app.
if kill -0 "$REPLICATING" 2>/dev/null; then
  STATUS=0
  wait "$REPLICATING" || STATUS=$?
fi

# Litestream doesn't send the changes since its last sync when it stops, so send them now.
litestream replicate -config "$CONFIG" -no-expand-env -once
exit "$STATUS"
