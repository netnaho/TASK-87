#!/bin/bash
# HarborOps test runner — only prerequisite is Docker.
#
# All tests (unit, frontend component, API) run inside the test-runner
# Docker container; no Node.js or npm installation on the host is needed.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  HarborOps Test Runner"
echo "========================================"

# ─── Prerequisite check ──────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not in PATH."
  echo "Install Docker Desktop (https://docs.docker.com/get-docker/) and re-run."
  exit 1
fi

# ─── Start application stack ─────────────────────────────────────────────────
echo "Starting application stack (docker compose up -d)..."
docker compose up -d

# ─── Wait for backend health ─────────────────────────────────────────────────
echo "Waiting for backend to become healthy..."
MAX_RETRIES=60
RETRY_COUNT=0
until docker compose exec -T backend wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Backend did not become healthy within $(( MAX_RETRIES * 3 ))s."
    echo "──── docker compose logs (last 50 lines) ────"
    docker compose logs --tail=50
    exit 1
  fi
  echo "  Waiting for backend... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 3
done
echo "Backend is healthy. Starting test run..."

# ─── Run all tests inside the test-runner container ──────────────────────────
# docker compose run activates the "test" profile automatically for this service.
# --rm removes the container after it exits; exit code propagates to this script.
docker compose run --rm test-runner
