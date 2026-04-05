#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  HarborOps Test Runner"
echo "========================================"

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

# ─── Unit Tests ──────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo "  Running Unit Tests"
echo "──────────────────────────────────────"

cd "$SCRIPT_DIR/backend"
npm install --prefer-offline 2>/dev/null || npm install
./node_modules/.bin/vitest run --config vitest.unit.config.ts --reporter=verbose
UNIT_EXIT=$?

echo ""
echo "Unit tests exit code: $UNIT_EXIT"

# ─── API Tests ───────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo "  Running API Tests"
echo "──────────────────────────────────────"

echo "Checking backend at $API_BASE_URL/api/health..."
MAX_RETRIES=30
RETRY_COUNT=0
until curl -sf "$API_BASE_URL/api/health" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: Backend not reachable after $MAX_RETRIES retries"
    echo "Make sure 'docker compose up' is running"
    exit 1
  fi
  echo "  Waiting for backend... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done
echo "Backend is healthy!"

cd "$SCRIPT_DIR/backend"
API_BASE_URL="$API_BASE_URL" ./node_modules/.bin/vitest run --config vitest.api.config.ts --reporter=verbose
API_EXIT=$?

echo ""
echo "API tests exit code: $API_EXIT"

# ─── Summary ─────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "  Unit Tests:  $([ $UNIT_EXIT -eq 0 ] && echo 'PASSED' || echo 'FAILED')"
echo "  API Tests:   $([ $API_EXIT -eq 0 ] && echo 'PASSED' || echo 'FAILED')"
echo "========================================"

if [ $UNIT_EXIT -ne 0 ] || [ $API_EXIT -ne 0 ]; then
  exit 1
fi

echo ""
echo "All tests passed!"
exit 0
