#!/usr/bin/env bash
set -euo pipefail

# Profile Node.js application
# Usage: ./scripts/profile.sh [--duration SECS] [--output DIR]

DURATION=30
OUTPUT_DIR="./profiles"
PORT=5000

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROFILE_DIR="${OUTPUT_DIR}/${TIMESTAMP}"

echo "==> Creating profile directory: ${PROFILE_DIR}"
mkdir -p "${PROFILE_DIR}"

echo "==> Starting server with profiling enabled..."
NODE_ENV=production \
  node --prof dist/index.cjs &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Check if server is running
if ! curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
  echo "Error: Server failed to start"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

echo "==> Server running (PID: ${SERVER_PID})"
echo "==> Generating load for ${DURATION} seconds..."

# Generate load using curl in parallel
for ((i=0; i<DURATION; i++)); do
  # Mix of requests
  curl -s "http://localhost:${PORT}/health" > /dev/null &
  curl -s "http://localhost:${PORT}/api/configs" > /dev/null &
  curl -s -X POST "http://localhost:${PORT}/api/engine/validate" \
    -H "Content-Type: application/json" \
    -d '{"content":"sets:\n  test: \"*.md\""}' > /dev/null &
  sleep 1
done

wait

echo "==> Stopping server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo "==> Processing V8 profile..."
ISOLATE_FILE=$(ls -t isolate-*.log 2>/dev/null | head -1)

if [[ -z "$ISOLATE_FILE" ]]; then
  echo "Warning: No V8 profile log found"
  exit 0
fi

# Process the profile
node --prof-process "$ISOLATE_FILE" > "${PROFILE_DIR}/profile.txt"
mv "$ISOLATE_FILE" "${PROFILE_DIR}/"

echo "==> Profile saved to: ${PROFILE_DIR}/profile.txt"

# Show top functions
echo ""
echo "=== TOP CPU CONSUMERS ==="
head -50 "${PROFILE_DIR}/profile.txt" | grep -A 30 "ticks parent"

echo ""
echo "==> Full profile: ${PROFILE_DIR}/profile.txt"
