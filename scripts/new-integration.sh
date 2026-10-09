#!/usr/bin/env bash
# Scaffold a new integration plugin package from the _template skeleton.
#
# Usage: npm run new:integration <name>
#   name — kebab-case integration identifier, e.g. "asana" or "azure-devops"
#
# What it does:
#   1. Copies packages/integrations/_template/ to packages/integrations/integration-<name>/
#   2. Substitutes __NAME__, __DISPLAY_NAME__, __PascalName__, __name__ placeholders
#   3. Adds it to viberglass.plugins.json and regenerates the plugin registrations
#   4. Prints next steps

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$WORKSPACE_ROOT/packages/integrations/_template"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: npm run new:integration <name>" >&2
  echo "  name must be a kebab-case identifier, e.g. \"asana\"" >&2
  exit 1
fi

# Validate: lowercase letters, digits, hyphens only
if ! [[ "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: name must be lowercase letters, digits, and hyphens (e.g. \"asana\", \"azure-devops\")" >&2
  exit 1
fi

TARGET_DIR="$WORKSPACE_ROOT/packages/integrations/integration-$NAME"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Error: $TARGET_DIR already exists" >&2
  exit 1
fi

# Derive display name and PascalCase from kebab-case
# e.g. "azure-devops" → "Azure Devops" and "AzureDevops"
DISPLAY_NAME="$(echo "$NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2); print}')"
PASCAL_NAME="$(echo "$DISPLAY_NAME" | tr -d ' ')"

echo "Scaffolding @viberglass/integration-$NAME …"

cp -r "$TEMPLATE_DIR" "$TARGET_DIR"

# Rename placeholder source files
if [[ -f "$TARGET_DIR/src/backend/__PascalName__Integration.ts" ]]; then
  mv "$TARGET_DIR/src/backend/__PascalName__Integration.ts" "$TARGET_DIR/src/backend/${PASCAL_NAME}Integration.ts"
fi
if [[ -f "$TARGET_DIR/src/frontend/__PascalName__Icon.tsx" ]]; then
  mv "$TARGET_DIR/src/frontend/__PascalName__Icon.tsx" "$TARGET_DIR/src/frontend/${PASCAL_NAME}Icon.tsx"
fi

# Substitute placeholders in all text files
find "$TARGET_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.js" \) | while read -r file; do
  sed -i \
    -e "s/__PascalName__/$PASCAL_NAME/g" \
    -e "s/__DISPLAY_NAME__/$DISPLAY_NAME/g" \
    -e "s/__name__/$NAME/g" \
    -e "s/__NAME__/$NAME/g" \
    "$file"
done

node "$WORKSPACE_ROOT/scripts/plugins/add.mjs" integrations "@viberglass/integration-$NAME"
node "$WORKSPACE_ROOT/scripts/plugins/generate.mjs"

echo ""
echo "Created $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  1. Implement $TARGET_DIR/src/backend/${PASCAL_NAME}Integration.ts"
echo "  2. Fill in src/manifest.ts: description, category, configFields, credentialUse, webhookProvider"
echo "  3. Replace the icon in src/frontend/, and add trackerWebhook or AuthSetupSection if needed"
echo "  4. Run: npm install && npm run build"
