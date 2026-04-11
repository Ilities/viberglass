#!/usr/bin/env bash
# Regenerate all agent Dockerfiles from their plugin fragments.
# Run from anywhere in the repo.
#
# Usage: npm run generate:dockerfiles

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SCRIPT_DIR/compose-dockerfile.sh"

# claude-code uses viberator-docker-worker.Dockerfile directly (not composed from a fragment)
# Each entry is: <variant> [--package <packageDirSuffix>] when they differ
"$COMPOSE" --agent codex
"$COMPOSE" --agent gemini
"$COMPOSE" --agent kimi
"$COMPOSE" --agent mistral --package mistral-vibe
"$COMPOSE" --agent opencode
"$COMPOSE" --agent pi
"$COMPOSE" --agent qwen

echo "All agent Dockerfiles generated in infra/workers/docker/generated/"
