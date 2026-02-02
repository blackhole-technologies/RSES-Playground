#!/usr/bin/env bash
set -euo pipefail

# Push Docker image to registry
# Usage: ./scripts/push.sh [--registry REGISTRY] [--tag TAG]

IMAGE_NAME="${IMAGE_NAME:-rses-cms}"
VERSION=$(node -p "require('./package.json').version")
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TAG="${VERSION}-${GIT_SHA}"
REGISTRY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --registry)
      REGISTRY="$2/"
      shift 2
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

FULL_IMAGE="${REGISTRY}${IMAGE_NAME}"

echo "==> Tagging for registry..."
docker tag "${IMAGE_NAME}:${TAG}" "${FULL_IMAGE}:${TAG}"
docker tag "${IMAGE_NAME}:latest" "${FULL_IMAGE}:latest"

echo "==> Pushing ${FULL_IMAGE}:${TAG}"
docker push "${FULL_IMAGE}:${TAG}"

echo "==> Pushing ${FULL_IMAGE}:latest"
docker push "${FULL_IMAGE}:latest"

echo "==> Done"
