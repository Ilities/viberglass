#!/bin/sh
# Installs Google's Antigravity ACP server (agy_acp_server.par and its
# localharness_external sibling) into $1, pinned by version and archive hash.
# Needs curl, unzip and sha256sum.
# Release list: https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json
set -eu

VERSION=1.2.1
DEST="${1:-/opt/agy-acp}"

case "$(uname -m)" in
  x86_64 | amd64) arch=x86_64; sha=9fbf0bd584a26478161f637cabd75113f72541c842d148f578ef1a6a9edcb843 ;;
  aarch64 | arm64) arch=arm64; sha=7e7ef4088bc185e1af4204029e0f4ec4210af20724f3ff262186ac0bcea6aa0e ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

archive="$(mktemp)"
curl -fsSL -o "$archive" \
  "https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-${VERSION}-linux-${arch}.zip"
echo "${sha}  ${archive}" | sha256sum -c -
mkdir -p "$DEST"
unzip -q "$archive" -d "$DEST"
rm -f "$archive"
