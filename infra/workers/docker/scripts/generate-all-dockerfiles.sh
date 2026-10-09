#!/usr/bin/env bash
# Regenerate the Dockerfiles of the harnesses in viberglass.plugins.json from their fragments.
# Run from anywhere in the repo, after building the plugins.
#
# Usage: npm run generate:dockerfiles

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
COMPOSE="$SCRIPT_DIR/compose-dockerfile.sh"

targets="$(node "$WORKSPACE_ROOT/scripts/plugins/agentDockerfiles.mjs")"

# Harnesses left out of the config lose their Dockerfile.
rm -f "$WORKSPACE_ROOT"/infra/workers/docker/generated/*.Dockerfile

while read -r variant package_dir; do
  [[ -n "$variant" ]] || continue
  "$COMPOSE" --agent "$variant" --dir "$package_dir"
done <<< "$targets"

echo "Agent Dockerfiles generated in infra/workers/docker/generated/"
