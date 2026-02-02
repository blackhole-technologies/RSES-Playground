#!/usr/bin/env bash
set -euo pipefail

# Health check for RSES CMS
# Usage: ./scripts/health-check.sh [HOST:PORT] [--namespace NS] [--timeout SECS]

HOST=""
NAMESPACE=""
TIMEOUT=30
RETRIES=5
DELAY=2

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --retries)
      RETRIES="$2"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1"
      exit 1
      ;;
    *)
      HOST="$1"
      shift
      ;;
  esac
done

# If namespace provided, use kubectl port-forward
if [[ -n "$NAMESPACE" ]]; then
  echo "==> Checking pods in namespace: ${NAMESPACE}"

  # Check pod status
  READY=$(kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=rses-cms \
    -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}')

  if [[ "$READY" != *"True"* ]]; then
    echo "Error: No ready pods found"
    kubectl get pods -n "${NAMESPACE}" -l app.kubernetes.io/name=rses-cms
    exit 1
  fi

  echo "==> Pods are ready"

  # Port forward for health check
  kubectl port-forward -n "${NAMESPACE}" svc/rses-cms 8080:80 &
  PF_PID=$!
  sleep 2
  HOST="localhost:8080"
  trap "kill $PF_PID 2>/dev/null" EXIT
fi

# Default host
HOST="${HOST:-localhost:5000}"

echo "==> Checking health at ${HOST}"

# Health check with retries
for ((i=1; i<=RETRIES; i++)); do
  if curl -sf "http://${HOST}/health" > /dev/null 2>&1; then
    echo "==> /health: OK"
    break
  fi

  if [[ $i -eq $RETRIES ]]; then
    echo "Error: /health check failed after ${RETRIES} attempts"
    exit 1
  fi

  echo "==> Attempt $i failed, retrying in ${DELAY}s..."
  sleep "$DELAY"
done

# Readiness check
if curl -sf "http://${HOST}/ready" > /dev/null 2>&1; then
  echo "==> /ready: OK"
else
  echo "Warning: /ready check failed (database may be unavailable)"
fi

# Metrics check
if curl -sf "http://${HOST}/metrics" > /dev/null 2>&1; then
  echo "==> /metrics: OK"
else
  echo "Warning: /metrics check failed"
fi

echo "==> Health check passed"
