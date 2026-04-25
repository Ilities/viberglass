#!/usr/bin/env bash
# Scaffold a new integration plugin package from the _template skeleton.
#
# Usage: npm run new:integration <name>
#   name — kebab-case integration identifier, e.g. "asana" or "azure-devops"
#
# What it does:
#   1. Copies packages/integrations/_template/ to packages/integrations/integration-<name>/
#   2. Substitutes __NAME__, __DISPLAY_NAME__, __PascalName__, __name__ placeholders
#   3. Prints next steps

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

# Substitute placeholders in all text files
find "$TARGET_DIR" -type f \( -name "*.ts" -o -name "*.json" -o -name "*.js" \) | while read -r file; do
  sed -i \
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
echo "  0. If '$NAME' is not yet in packages/types/src/common.ts TICKET_SYSTEMS, add it first."
echo "  1. Implement $TARGET_DIR/src/backend/${PASCAL_NAME}Integration.ts"
echo "  2. Fill in configFields and supports in src/backend/plugin.ts"
echo "  3. Add custom section components to src/frontend/ if needed"
echo "  4. Add to apps/platform-backend/package.json:  \"@viberglass/integration-$NAME\": \"*\""
echo "  5. Import in apps/platform-backend/src/integrations/registerIntegrationPlugins.ts:"
echo "       import ${NAME}Plugin from \"@viberglass/integration-$NAME\";"
echo "       .register(${NAME}Plugin)"
echo "  6. Add to apps/platform-frontend/package.json:  \"@viberglass/integration-$NAME\": \"*\""
echo "  7. Import in apps/platform-frontend/src/integrations/registerFrontendIntegrationPlugins.ts:"
echo "       import ${NAME}Frontend from \"@viberglass/integration-$NAME/frontend\";"
echo "       .register(${NAME}Frontend)"
echo "  8. Run: npm install && npm run build"
