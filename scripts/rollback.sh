#!/usr/bin/env bash
set -euo pipefail

# Rollback Kubernetes deployment
# Usage: ./scripts/rollback.sh [--namespace NS] [--revision REV]

NAMESPACE="${NAMESPACE:-rses-cms}"
REVISION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --revision)
      REVISION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "==> Rolling back deployment in namespace: ${NAMESPACE}"

# Show current status
echo "==> Current rollout history:"
kubectl rollout history deployment/rses-cms --namespace "${NAMESPACE}"

# Rollback
if [[ -n "$REVISION" ]]; then
  echo "==> Rolling back to revision: ${REVISION}"
  kubectl rollout undo deployment/rses-cms \
    --namespace "${NAMESPACE}" \
    --to-revision="${REVISION}"
else
  echo "==> Rolling back to previous revision"
  kubectl rollout undo deployment/rses-cms --namespace "${NAMESPACE}"
fi

# Wait for rollout
echo "==> Waiting for rollback to complete..."
kubectl rollout status deployment/rses-cms \
  --namespace "${NAMESPACE}" \
  --timeout="300s"

# Verify
echo "==> Running health check..."
./scripts/health-check.sh --namespace "${NAMESPACE}"

echo "==> Rollback complete"
