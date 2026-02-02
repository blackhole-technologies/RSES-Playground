#!/usr/bin/env bash
set -euo pipefail

# Build Docker image for RSES CMS
# Usage: ./scripts/build.sh [--test] [--tag TAG]

IMAGE_NAME="${IMAGE_NAME:-rses-cms}"
VERSION=$(node -p "require('./package.json').version")
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TAG="${VERSION}-${GIT_SHA}"
RUN_TESTS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test)
      RUN_TESTS=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "==> Building ${IMAGE_NAME}:${TAG}"

# Run tests if requested
if [[ "$RUN_TESTS" == "true" ]]; then
  echo "==> Running tests..."
  npm test
fi

# Build image
docker build \
  --tag "${IMAGE_NAME}:${TAG}" \
  --tag "${IMAGE_NAME}:latest" \
  --build-arg VERSION="${VERSION}" \
  --build-arg GIT_SHA="${GIT_SHA}" \
  .

echo "==> Built ${IMAGE_NAME}:${TAG}"
echo "==> Tagged ${IMAGE_NAME}:latest"
