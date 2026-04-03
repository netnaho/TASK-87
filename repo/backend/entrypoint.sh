#!/bin/sh
set -e

echo "Waiting for MySQL to be ready..."
MAX_RETRIES=60
RETRY_COUNT=0
until node -e "
const mysql = require('net');
const s = new mysql.Socket();
s.connect(3306, 'mysql', () => { s.destroy(); process.exit(0); });
s.on('error', () => process.exit(1));
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: MySQL not reachable after $MAX_RETRIES retries"
    exit 1
  fi
  echo "  Waiting for MySQL... (attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

# Extra wait for MySQL to finish initialization
sleep 5
echo "MySQL is ready!"

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database..."
node dist/prisma/seed.js || echo "Seed completed (may have already run)"

echo "Starting backend server..."
exec node dist/src/index.js
