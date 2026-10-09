#!/usr/bin/env bash
# Compose an agent Dockerfile from the standard header + plugin fragment.
#
# Usage:
#   ./compose-dockerfile.sh --agent <variant> [--dir <package dir>]
#
# Examples:
#   ./compose-dockerfile.sh --agent pi
#   ./compose-dockerfile.sh --agent mistral --dir packages/agents/agent-mistral-vibe
#
# Output: infra/workers/docker/generated/<variant>.Dockerfile
#
# See also: generate-all-dockerfiles.sh to regenerate all at once.

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
AGENT=""
PACKAGE_DIR=""  # defaults to packages/agents/agent-<variant>

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent)   AGENT="$2";   shift 2 ;;
    --dir)     PACKAGE_DIR="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$AGENT" ]]; then
  echo "Usage: $(basename "$0") --agent <variant> [--dir <package dir>]" >&2
  echo "Example: $(basename "$0") --agent pi" >&2
  echo "Example: $(basename "$0") --agent mistral --dir packages/agents/agent-mistral-vibe" >&2
  exit 1
fi

PACKAGE_DIR="${PACKAGE_DIR:-packages/agents/agent-$AGENT}"

FRAGMENT_FILE="$WORKSPACE_ROOT/$PACKAGE_DIR/Dockerfile.fragment"
if [[ ! -f "$FRAGMENT_FILE" ]]; then
  echo "Error: Fragment not found: $FRAGMENT_FILE" >&2
  exit 1
fi

OUTPUT_DIR="$WORKSPACE_ROOT/infra/workers/docker/generated"
mkdir -p "$OUTPUT_DIR"
OUTPUT_FILE="$OUTPUT_DIR/$AGENT.Dockerfile"

{
  echo "# Generated Dockerfile for $AGENT"
  echo "# Do not edit manually — regenerate with: npm run generate:dockerfiles"
  echo ""
  echo "ARG BASE_IMAGE=base-worker"
  echo "FROM \${BASE_IMAGE} AS $AGENT-worker"
  echo ""
  echo "ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global"
  echo "ENV PATH=\"/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:\${PATH}\""
  echo ""
  cat "$FRAGMENT_FILE"
  echo ""
  echo "CMD [\"node\", \"apps/viberator/dist/cli-worker.js\", \"--help\"]"
} > "$OUTPUT_FILE"

echo "Generated: $OUTPUT_FILE"
