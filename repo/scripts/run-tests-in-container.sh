#!/bin/sh
# Runs inside the test-runner Docker container.
# Called by: docker compose run --rm test-runner
# Only prerequisite outside this container: Docker.
set -e

echo "========================================"
echo "  HarborOps Test Runner (containerised)"
echo "========================================"

# ─── System dependencies ──────────────────────────────────────────────────────
# openssl must be present so Prisma can detect the installed library version
# and choose the matching query-engine binary at runtime.
echo "Installing system dependencies..."
apt-get update -qq && apt-get install -y --no-install-recommends openssl >/dev/null 2>&1 || true

# ─── Backend dependencies + Prisma client ────────────────────────────────────
echo "Installing backend npm packages..."
cd /app/backend
npm install --prefer-offline --silent

# Regenerate Prisma client for this container's exact OpenSSL version.
# The named volume may contain a binary built on a different platform
# (e.g. the host). prisma generate detects the current environment and
# writes the correct engine binary into node_modules/.prisma/client/.
echo "Regenerating Prisma client for this container platform..."
./node_modules/.bin/prisma generate

# ─── Unit tests ──────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Unit Tests"
echo "======================================"
npx vitest run --config vitest.unit.config.ts --reporter=verbose
UNIT_EXIT=$?

# ─── Frontend tests ───────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Frontend Tests"
echo "======================================"
cd /app/frontend
npm install --prefer-offline --silent
npx vitest run --reporter=verbose
FRONTEND_EXIT=$?

# ─── API tests ────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  API Tests"
echo "======================================"
cd /app/backend
npx vitest run --config vitest.api.config.ts --reporter=verbose
API_EXIT=$?

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo "  Test Summary"
echo "======================================"
[ "$UNIT_EXIT"     -eq 0 ] && echo "  Unit Tests:     PASSED" || echo "  Unit Tests:     FAILED"
[ "$FRONTEND_EXIT" -eq 0 ] && echo "  Frontend Tests: PASSED" || echo "  Frontend Tests: FAILED"
[ "$API_EXIT"      -eq 0 ] && echo "  API Tests:      PASSED" || echo "  API Tests:      FAILED"
echo "======================================"

if [ "$UNIT_EXIT" -ne 0 ] || [ "$FRONTEND_EXIT" -ne 0 ] || [ "$API_EXIT" -ne 0 ]; then
  exit 1
fi

echo ""
echo "All tests passed!"
