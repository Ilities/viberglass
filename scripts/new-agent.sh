#!/usr/bin/env bash
# Scaffold a new agent plugin package from the _template skeleton.
#
# Usage: npm run new:agent <name>
#   name — kebab-case agent identifier, e.g. "aider" or "cursor"
#
# What it does:
#   1. Copies packages/agents/_template/ to packages/agents/agent-<name>/
#   2. Substitutes __NAME__, __DISPLAY_NAME__, __PascalName__, __name__ placeholders
#   3. Prints next steps

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$WORKSPACE_ROOT/packages/agents/_template"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: npm run new:agent <name>" >&2
  echo "  name must be a kebab-case identifier, e.g. \"aider\"" >&2
  exit 1
fi

# Validate: lowercase letters, digits, hyphens only
if ! [[ "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: name must be lowercase letters, digits, and hyphens (e.g. \"aider\", \"my-agent\")" >&2
  exit 1
fi

TARGET_DIR="$WORKSPACE_ROOT/packages/agents/agent-$NAME"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Error: $TARGET_DIR already exists" >&2
  exit 1
fi

# Derive display name and PascalCase from kebab-case
# e.g. "my-agent" → "My Agent" and "MyAgent"
DISPLAY_NAME="$(echo "$NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')"
PASCAL_NAME="$(echo "$DISPLAY_NAME" | tr -d ' ')"
NAME_UPPER="$(echo "$NAME" | tr '[:lower:]-' '[:upper:]_')"

echo "Scaffolding @viberglass/agent-$NAME …"

cp -r "$TEMPLATE_DIR" "$TARGET_DIR"

# Rename placeholder files
if [[ -f "$TARGET_DIR/src/__PascalName__Agent.ts" ]]; then
  mv "$TARGET_DIR/src/__PascalName__Agent.ts" "$TARGET_DIR/src/${PASCAL_NAME}Agent.ts"
fi
if [[ -f "$TARGET_DIR/test/__PascalName__Agent.test.ts" ]]; then
  mv "$TARGET_DIR/test/__PascalName__Agent.test.ts" "$TARGET_DIR/test/${PASCAL_NAME}Agent.test.ts"
fi

# Substitute placeholders in all text files
find "$TARGET_DIR" -type f \( -name "*.ts" -o -name "*.json" -o -name "*.js" -o -name "Dockerfile.fragment" \) | while read -r file; do
  sed -i \
    -e "s/__NAME_UPPER__/$NAME_UPPER/g" \
    -e "s/__PascalName__/$PASCAL_NAME/g" \
    -e "s/__DISPLAY_NAME__/$DISPLAY_NAME/g" \
    -e "s/__name__/$NAME/g" \
    -e "s/__NAME__/$NAME/g" \
    "$file"
done

echo ""
echo "Created $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. Implement $TARGET_DIR/src/${PASCAL_NAME}Agent.ts"
echo "  2. Fill in plugin.ts defaultConfig and envAliases"
echo "  3. Update Dockerfile.fragment with the real install command"
echo "  4. Add to apps/viberator/package.json:  \"@viberglass/agent-$NAME\": \"*\""
echo "  5. Add to apps/viberator/src/agents/registerPlugins.ts:"
echo "       import ${NAME}Plugin from \"@viberglass/agent-$NAME\";"
echo "       .register(${NAME}Plugin)"
echo "  6. Run: npm install && npm run build && npm run generate:catalog && npm run generate:dockerfiles"
