#!/usr/bin/env bash
set -euo pipefail

npm run build -w @viberglass/types -w @viberglass/telemetry

npm run build -w @viberglass/platform-ui -w @viberglass/model-hosting-verda -w @viberglass/mcp-server -w @viberglass/integration-core

integration_ws=$(node "$(dirname "$0")/plugins/list.mjs" integrations)

if [ -n "$integration_ws" ]; then
  npm run build $integration_ws
fi
