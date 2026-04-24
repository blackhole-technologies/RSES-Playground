#!/usr/bin/env bash
set -euo pipefail

# Run database migrations
# Usage: ./scripts/db-migrate.sh [--dry-run] [--generate NAME]

DRY_RUN=false
GENERATE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --generate)
      GENERATE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL environment variable is required"
  exit 1
fi

if [[ -n "$GENERATE" ]]; then
  echo "==> Generating migration: ${GENERATE}"
  npx drizzle-kit generate --name "${GENERATE}"
  exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> Dry run - checking pending migrations..."
  npx drizzle-kit check
else
  echo "==> Running migrations..."
  npx drizzle-kit migrate
  echo "==> Migrations complete"
fi
