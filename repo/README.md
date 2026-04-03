# HarborOps — Lodging & Supply Management System

A production-grade full-stack application for property companies managing multiple locations with on-site inventory, guest/host reviews, trust controls, promotion pricing, moderation workflows, and comprehensive reporting.

## Start Command

```bash
docker compose up
```

No manual setup, no `.env` file, no database imports. Everything initializes automatically.

## Service Addresses

| Service  | URL                              | Description              |
|----------|----------------------------------|--------------------------|
| Frontend | http://localhost:5173            | Vue.js web application   |
| Backend  | http://localhost:3000            | Express REST API         |
| MySQL    | localhost:3307                   | MySQL 8 database         |
| Health   | http://localhost:3000/api/health | Backend health check     |

## Demo Accounts

All accounts are seeded automatically on first startup:

| Role            | Username    | Password        |
|-----------------|-------------|-----------------|
| Admin           | `admin`     | `admin123!`     |
| Manager         | `manager`   | `manager123!`   |
| Inventory Clerk | `clerk`     | `clerk123!`     |
| Front Desk      | `frontdesk` | `frontdesk123!` |
| Host            | `host`      | `host123!`      |
| Guest           | `guest`     | `guest123!`     |
| Moderator       | `moderator` | `moderator123!` |

## Verification Method

### 1. Start the stack

```bash
docker compose up
```

Wait until you see `HarborOps backend running on port 3000` in logs.

### 2. Check backend health

```bash
curl http://localhost:3000/api/health
# {"success":true,"data":{"status":"healthy","timestamp":"...","version":"1.0.0","uptime":...}}
```

### 3. Login via API

```bash
# Login as admin
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123!"}' | python3 -m json.tool

# Save token for subsequent requests
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123!"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
```

### 4. Sample API verification

```bash
# Inventory items
curl -s http://localhost:3000/api/inventory/items -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Search products
curl -s "http://localhost:3000/api/search/products?q=towel" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Trust score
curl -s http://localhost:3000/api/trust/score -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Promotions
curl -s http://localhost:3000/api/promotions -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Low-stock alerts
curl -s http://localhost:3000/api/inventory/low-stock -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 5. Open frontend

Navigate to http://localhost:5173 and log in with any demo account. Different roles see different sidebar menus and dashboard cards.

## Test Execution

```bash
# Ensure stack is running first
docker compose up -d

# Install backend dev dependencies (one-time, if running outside Docker)
cd backend && npm install && cd ..

# Run all tests (unit + API)
chmod +x run_tests.sh
./run_tests.sh
```

### Test suites

| Suite | Dir | Count | Coverage |
|-------|-----|-------|----------|
| Unit tests | `unit_tests/` | 10 files | Auth, cache, encryption, inventory, moderation, promotions, reviews, trust, types |
| API tests | `API_tests/` | 10 files | Health, auth, RBAC, smoke, inventory, reviews, promotions, moderation, trust, search |

## Project Structure

```
repo/
├── docker-compose.yml          # One-command startup (MySQL + backend + frontend)
├── README.md                   # This file
├── run_tests.sh                # Test runner (unit + API)
├── SELF_TEST_REPORT.md         # Self-test acceptance report
│
├── backend/
│   ├── Dockerfile              # Multi-stage Node 20 Alpine build
│   ├── entrypoint.sh           # DB wait → migrate → seed → start
│   ├── prisma/
│   │   ├── schema.prisma       # 35+ models, full-text indexes
│   │   ├── seed.ts             # Deterministic demo data
│   │   └── migrations/         # SQL migration history
│   └── src/
│       ├── index.ts            # Express bootstrap, route registration
│       ├── config/             # Centralized configuration
│       ├── middleware/          # Auth (JWT), RBAC, rate limiter, upload, error handler
│       ├── lib/                # Cache, encryption, exporter, content filter, scheduler
│       └── modules/            # Domain modules (10 modules)
│           ├── auth/           # Register, login, JWT (bcrypt + per-user salt)
│           ├── inventory/      # Items, vendors, lots, movements, ledger, stock counts
│           ├── reviews/        # Ratings, images, tags, follow-ups, host replies
│           ├── trust/          # Trust scores, credit delta, leaderboard, admin adjust
│           ├── moderation/     # Reports, queue, actions, appeals, sensitive words
│           ├── promotions/     # Pricing rules, exclusions, conflict resolution, checkout
│           ├── search/         # Full-text (MATCH...AGAINST), suggestions, trending
│           ├── reports/        # KPI dashboard, scheduled reports
│           ├── locations/      # Location CRUD
│           └── users/          # Admin user management
│
├── frontend/
│   ├── Dockerfile              # Multi-stage build → Nginx Alpine
│   ├── nginx.conf              # Reverse proxy (API + uploads + SPA fallback)
│   └── src/
│       ├── api/                # Typed Axios endpoints (11 service files)
│       ├── stores/             # Pinia auth store with role persistence
│       ├── router/             # Vue Router with RBAC guards
│       ├── components/         # Layout shell + 7 shared components
│       ├── composables/        # usePagination, useAppMessage, etc.
│       └── views/              # 21 page views across 8 domains
│
├── unit_tests/                 # Vitest unit tests (10 files)
└── API_tests/                  # Vitest + Supertest API tests (10 files)
```

## Architecture Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite + Pinia + Vue Router + Tailwind CSS + Naive UI |
| Backend | Express + TypeScript + Prisma ORM + Zod validation |
| Database | MySQL 8 with full-text indexes, 35+ tables, immutable ledger |
| Auth | bcrypt with per-user salts, JWT (24h expiry), RBAC middleware |
| Security | AES-256-GCM encryption at rest, phone masking, export watermarking |
| Caching | In-memory TTL cache (configurable, default 15 min) |
| Scheduling | node-cron for nightly KPI aggregation, usage update, low-stock alerts |
| Exports | CSV (csv-stringify) + Excel (exceljs) with username/timestamp watermarks |
| Logging | Pino structured JSON logging |
| Uploads | Multer (5MB/file, 6 files max) with Docker volume storage |

## Key Design Decisions

- **Immutable ledger**: Inventory movements are append-only for full traceability
- **Per-user salt**: Each user has a unique cryptographic salt prepended before bcrypt hashing
- **Offline-first**: No external API dependencies; everything runs locally in Docker
- **Role-based UI**: Sidebar, dashboard, and route access dynamically adjust per user role
- **Domain modules**: Each business domain is self-contained (routes/controller/service/schema)
- **Content filtering**: Sensitive word matching with word-boundary checks to avoid false positives
- **Promotion conflict resolution**: Priority-based with max-savings tiebreaker and mutual exclusion
- **Trust credit system**: Rating-based delta (5★→+2 ... 1★→-2), score clamped 0-100
- **Appeal state machine**: PENDING → IN_REVIEW → UPHELD/OVERTURNED with auto-restore on overturn
