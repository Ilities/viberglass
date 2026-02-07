#!/bin/bash
# Secrets Provisioning Script
#
# Provisions application secrets to AWS SSM Parameter Store for a given environment.
# This script should be run once per environment during initial setup.
#
# Usage:
#   ./scripts/provision-secrets.sh <environment>
#
# Example:
#   ./scripts/provision-secrets.sh dev
#   ./scripts/provision-secrets.sh staging
#   ./scripts/provision-secrets.sh prod

set -e
set -u

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=${1:-}

if [ -z "$ENV" ]; then
  echo -e "${RED}Error: Environment is required${NC}"
  echo "Usage: $0 <environment>"
  echo "Example: $0 prod"
  exit 1
fi

if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo -e "${RED}Error: Invalid environment '$ENV'${NC}"
  echo "Valid environments: dev, staging, prod"
  exit 1
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Secrets Provisioning${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}$ENV${NC}"
echo ""

# Production warning
if [ "$ENV" == "prod" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Provisioning PRODUCTION secrets${NC}"
  echo ""
  read -p "Type 'YES' to confirm: " CONFIRM
  if [ "$CONFIRM" != "YES" ]; then
    echo "Cancelled"
    exit 1
  fi
  echo ""
fi

BASE_PATH="/viberglass/$ENV"

# Function to store secret in SSM
store_secret() {
  local name=$1
  local value=$2
  local description=$3

  echo -n "Storing $name... "

  if aws ssm put-parameter \
    --name "$BASE_PATH/$name" \
    --value "$value" \
    --type "SecureString" \
    --description "$description" \
    --overwrite \
    --region "${AWS_REGION:-us-east-1}" \
    > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
  else
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Failed to store $name${NC}"
    exit 1
  fi
}

# Function to generate random secret
generate_random() {
  openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

echo "Provisioning secrets to AWS SSM Parameter Store..."
echo ""

# Session Secret (for cookie signing)
echo "1. Session Secret"
SESSION_SECRET=${SESSION_SECRET:-$(generate_random)}
store_secret "session/secret" "$SESSION_SECRET" "Session secret for cookie signing"

# JWT Secret (for API tokens)
echo "2. JWT Secret"
JWT_SECRET=${JWT_SECRET:-$(generate_random)}
store_secret "jwt/secret" "$JWT_SECRET" "JWT secret for API token signing"

# GitHub Webhook Secret (if configured)
if [ -n "${GITHUB_WEBHOOK_SECRET:-}" ]; then
  echo "3. GitHub Webhook Secret"
  store_secret "github/webhook-secret" "$GITHUB_WEBHOOK_SECRET" "GitHub webhook signature verification"
fi

# GitHub Token (if configured)
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "4. GitHub Token"
  store_secret "github/token" "$GITHUB_TOKEN" "GitHub personal access token"
fi

# Linear API Key (if configured)
if [ -n "${LINEAR_API_KEY:-}" ]; then
  echo "5. Linear API Key"
  store_secret "linear/api-key" "$LINEAR_API_KEY" "Linear API key for integration"
fi

# Jira API Token (if configured)
if [ -n "${JIRA_API_TOKEN:-}" ]; then
  echo "6. Jira API Token"
  store_secret "jira/api-token" "$JIRA_API_TOKEN" "Jira API token for integration"
fi

# Anthropic API Key (for Viberator)
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "7. Anthropic API Key"
  store_secret "anthropic/api-key" "$ANTHROPIC_API_KEY" "Anthropic API key for Claude AI"
fi

# SMTP Password (if email is configured)
if [ -n "${SMTP_PASSWORD:-}" ]; then
  echo "8. SMTP Password"
  store_secret "smtp/password" "$SMTP_PASSWORD" "SMTP password for email notifications"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Secrets Provisioning Complete${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Secrets stored in AWS SSM Parameter Store"
echo "Base path: $BASE_PATH"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify secrets: aws ssm get-parameters-by-path --path $BASE_PATH --recursive --with-decryption"
echo "  2. Update ECS task definition to reference these parameters"
echo "  3. Grant ECS task role permission to read from SSM"
echo ""
