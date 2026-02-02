#!/usr/bin/env bash
set -euo pipefail

# Deploy to Kubernetes
# Usage: ./scripts/deploy.sh [--namespace NS] [--image IMAGE] [--dry-run]

NAMESPACE="${NAMESPACE:-rses-cms}"
IMAGE=""
DRY_RUN=""
TIMEOUT="300s"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="--dry-run=client"
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "==> Deploying to namespace: ${NAMESPACE}"

# Apply manifests
if [[ -n "$IMAGE" ]]; then
  echo "==> Using image: ${IMAGE}"
  cd k8s && kustomize edit set image "rses-cms=${IMAGE}" && cd ..
fi

kubectl apply -k k8s/ ${DRY_RUN}

if [[ -z "$DRY_RUN" ]]; then
  echo "==> Waiting for rollout..."
  kubectl rollout status deployment/rses-cms \
    --namespace "${NAMESPACE}" \
    --timeout="${TIMEOUT}"

  echo "==> Running health check..."
  ./scripts/health-check.sh --namespace "${NAMESPACE}"
fi

echo "==> Deployment complete"
