#!/bin/bash
# Production Migration Runner Script
#
# Safely runs database migrations against production or staging environments
# with proper validation and rollback capabilities.
#
# Usage:
#   ./scripts/run-migrations.sh <environment> [--dry-run]
#
# Examples:
#   ./scripts/run-migrations.sh dev          # Run migrations in dev
#   ./scripts/run-migrations.sh staging      # Run migrations in staging
#   ./scripts/run-migrations.sh prod         # Run migrations in production
#   ./scripts/run-migrations.sh prod --dry-run  # Dry run for production

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENV=${1:-dev}
DRY_RUN=${2:-}

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Database Migration Runner${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}$ENV${NC}"

# Validate environment
if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
  echo -e "${RED}Error: Invalid environment '$ENV'${NC}"
  echo "Valid environments: dev, staging, prod"
  exit 1
fi

# Production safety check
if [ "$ENV" == "prod" ]; then
  echo -e "${YELLOW}⚠️  WARNING: Running migrations in PRODUCTION${NC}"
  echo ""
  echo "This will modify the production database!"
  echo ""
  read -p "Type 'YES' to confirm: " CONFIRM

  if [ "$CONFIRM" != "YES" ]; then
    echo -e "${RED}Migration cancelled${NC}"
    exit 1
  fi
fi

# Get database URL from SSM Parameter Store
echo ""
echo "Fetching database credentials from SSM..."

DB_URL=$(aws ssm get-parameter \
  --name "/viberglass/${ENV}/database/url" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Failed to fetch database URL from SSM${NC}"
  echo "Parameter: /viberglass/${ENV}/database/url"
  echo ""
  echo "Make sure:"
  echo "  1. AWS credentials are configured"
  echo "  2. You have SSM parameter access"
  echo "  3. The parameter exists in SSM"
  exit 1
fi

# Mask password in output
DB_URL_MASKED=$(echo $DB_URL | sed 's/:.*@/:****@/g')
echo -e "${GREEN}✓ Database URL retrieved${NC}"
echo "  Connection: $DB_URL_MASKED"

# Export for migration tool
export DATABASE_URL=$DB_URL

# Backup check for production
if [ "$ENV" == "prod" ]; then
  echo ""
  echo "Checking recent RDS backups..."

  # Get RDS instance ID from database URL
  DB_HOST=$(echo $DB_URL | sed -n 's/.*@\(.*\):.*/\1/p')
  RDS_INSTANCE=$(aws rds describe-db-instances \
    --query "DBInstances[?Endpoint.Address=='$DB_HOST'].DBInstanceIdentifier | [0]" \
    --output text 2>/dev/null || echo "")

  if [ -n "$RDS_INSTANCE" ]; then
    LATEST_BACKUP=$(aws rds describe-db-snapshots \
      --db-instance-identifier "$RDS_INSTANCE" \
      --snapshot-type automated \
      --query 'DBSnapshots | sort_by(@, &SnapshotCreateTime) | [-1].SnapshotCreateTime' \
      --output text 2>/dev/null || echo "unknown")

    echo "  Latest backup: $LATEST_BACKUP"

    if [ "$LATEST_BACKUP" == "unknown" ] || [ -z "$LATEST_BACKUP" ]; then
      echo -e "${YELLOW}⚠️  Warning: Could not verify recent backup${NC}"
      read -p "Continue anyway? (yes/no): " CONTINUE

      if [ "$CONTINUE" != "yes" ]; then
        echo -e "${RED}Migration cancelled${NC}"
        exit 1
      fi
    fi
  else
    echo -e "${YELLOW}⚠️  Warning: Could not identify RDS instance${NC}"
  fi
fi

# Dry run mode
if [ "$DRY_RUN" == "--dry-run" ]; then
  echo ""
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
  echo "Would run migrations against:"
  echo "  Environment: $ENV"
  echo "  Database: $DB_URL_MASKED"
  echo ""
  echo "To run for real, execute without --dry-run flag"
  exit 0
fi

# Check current migration status
echo ""
echo "Checking current migration status..."

cd "$(dirname "$0")/.."

# Get list of pending migrations
PENDING_MIGRATIONS=$(npm run migrate:status -w @viberglass/platform-backend 2>&1 | grep -c "pending" || echo "0")

echo "Pending migrations: $PENDING_MIGRATIONS"

if [ "$PENDING_MIGRATIONS" == "0" ]; then
  echo -e "${GREEN}✓ Database is up to date${NC}"
  exit 0
fi

# Run migrations
echo ""
echo -e "${GREEN}Running migrations...${NC}"
echo ""

if npm run migrate -w @viberglass/platform-backend; then
  echo ""
  echo -e "${GREEN}✓ Migrations completed successfully${NC}"

  # Verify migrations
  echo ""
  echo "Verifying migration status..."
  npm run migrate:status -w @viberglass/platform-backend

  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}Migration Summary${NC}"
  echo -e "${GREEN}================================${NC}"
  echo "  Environment: $ENV"
  echo "  Status: SUCCESS"
  echo "  Applied: $PENDING_MIGRATIONS migration(s)"
  echo ""

  if [ "$ENV" == "prod" ]; then
    echo -e "${YELLOW}Remember to:${NC}"
    echo "  1. Monitor CloudWatch logs for errors"
    echo "  2. Verify application health"
    echo "  3. Update deployment documentation"
  fi

  exit 0
else
  echo ""
  echo -e "${RED}================================${NC}"
  echo -e "${RED}Migration Failed${NC}"
  echo -e "${RED}================================${NC}"
  echo ""
  echo "Migrations did not complete successfully!"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Check error messages above"
  echo "  2. Review migration code for issues"
  echo "  3. Check database logs"
  echo "  4. Consider rolling back (see rollback-procedure.md)"
  echo ""

  exit 1
fi
