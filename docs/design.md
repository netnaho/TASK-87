# HarborOps System Design (As Implemented)

## 1. Purpose and Scope

This document describes the **current implemented design** of HarborOps in `repo/`, including architecture, key domain workflows, data model boundaries, security controls, and operational behavior.

It is an implementation-first design reference (not a greenfield proposal).

---

## 2. System Overview

HarborOps is a full-stack, offline-first property operations platform for:

- multi-location inventory control,
- guest/host review and trust workflows,
- moderation and appeals,
- pricing/promotion resolution at checkout,
- product search and KPI/reporting.

### Core stack

- **Frontend:** Vue 3 + TypeScript + Pinia + Vue Router + Naive UI + Tailwind
- **Backend:** Express + TypeScript + Prisma + Zod
- **Database:** MySQL 8
- **Runtime:** Docker Compose (frontend, backend, db)

---

## 3. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Vue SPA)                          │
│  - Role-aware routes/menu (Pinia auth + Router guards)            │
│  - Axios client attaches JWT                                       │
└───────────────────────────────┬─────────────────────────────────────┘
																│ /api (Nginx reverse proxy)
																▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Express API (TypeScript)                        │
│  Middleware pipeline:                                               │
│  requestLogger → auth/RBAC → validation → controller → service      │
│  Shared libs: Prisma, cache (TTL), exporter, encryption, scheduler  │
└───────────────────────────────┬─────────────────────────────────────┘
																│ Prisma ORM / raw SQL (FTS)
																▼
┌─────────────────────────────────────────────────────────────────────┐
│                            MySQL 8                                  │
│  Domain tables: inventory, reviews, trust, moderation, promotions,  │
│  search, reports, users/roles                                       │
│  Full-text indexes: items, search_logs                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Deployment and Runtime Topology

`docker-compose.yml` provisions:

1. `mysql` (persistent volume `mysql_data`, healthcheck enabled)
2. `backend` (depends on healthy mysql, upload volume `upload_data`)
3. `frontend` (serves built SPA via Nginx, depends on healthy backend)

### Exposed ports

- Frontend: `5173`
- Backend: `3000`
- MySQL: `3307` (host) → `3306` (container)

### Startup behavior

- Backend health endpoint: `GET /api/health`
- Backend scheduler starts on server boot
- Prisma migrations/seeding handled by backend entrypoint path in container startup flow

---

## 5. Backend Design

## 5.1 Module organization

Backend domain modules under `backend/src/modules/`:

- `auth`
- `users`
- `locations`
- `inventory`
- `reviews`
- `trust`
- `moderation`
- `promotions`
- `search`
- `reports`

Each module follows the same contract:

- `*.routes.ts` (routing + middleware attachment)
- `*.controller.ts` (request mapping)
- `*.service.ts` (business logic + persistence)
- `*.schema.ts` (Zod request validation)

## 5.2 Request lifecycle

1. Express route receives request
2. `authenticate` verifies JWT (except public routes)
3. `authorize(...)` enforces role access
4. Zod schema validates params/query/body
5. Service executes business rules + Prisma actions
6. Response wrapped in common envelope
7. Global `errorHandler` translates known errors to API errors

## 5.3 API response shape

- Success: `{ success: true, data: ... }`
- Error: `{ success: false, error: { code, message } }`

---

## 6. Frontend Design

## 6.1 Application shell

- `App.vue` sets global Naive UI providers and theme overrides.
- `components/AppLayout.vue` provides:
  - collapsible sidebar,
  - role-aware menu composition,
  - breadcrumb header,
  - workspace view container.

## 6.2 Routing and RBAC

`frontend/src/router/index.ts`:

- public route: `/login`
- protected root layout: `/`
- role-gated subroutes for inventory, moderation, reports, admin, etc.
- navigation guard behavior:
  - redirect unauthenticated users to login,
  - prevent login page for authenticated users,
  - block unauthorized role access by redirecting to dashboard.

## 6.3 Auth state and API transport

- Pinia `auth` store persists token and user in localStorage.
- Axios client (`api/client.ts`) automatically injects `Authorization: Bearer <token>`.
- `401` responses clear local auth state and redirect to `/login`.

---

## 7. Domain Model and Data Design

## 7.1 Identity and roles

- `User` with enum `Role`:
  - `ADMIN`, `MANAGER`, `INVENTORY_CLERK`, `FRONT_DESK`, `HOST`, `GUEST`, `MODERATOR`.
- Password storage: hash + per-user salt.

## 7.2 Inventory domain

Core entities:

- `Item`, `Vendor`, `Lot`, `StockLevel`, `InventoryLedger`, `StockCount`, `StockCountLine`.

Design properties:

- immutable ledger via append-only `InventoryLedger`,
- optional lot control per item,
- optional expiration requirement per item,
- per-location (and optional per-lot) stock levels,
- configurable safety threshold + average daily usage.

## 7.3 Reviews and trust

Core entities:

- `Review`, `ReviewImage`, `Tag`, `ReviewTag`, `HostReply`,
- `TrustScore`, `CreditHistory`, `TaskRating`, `ServiceInteraction`.

Design properties:

- multi-axis rating (cleanliness, communication, accuracy),
- follow-up relation via `parentReviewId`,
- host reply one-to-one via `HostReply.reviewId @unique`,
- trust score history kept in append-only `CreditHistory`.

## 7.4 Moderation and appeals

Core entities:

- `Report`, `ModerationAction`, `Appeal`, `SensitiveWord`.

Design properties:

- queue-based triage (`PENDING`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`),
- moderation action trail (warn/hide/remove/restore),
- appeals lifecycle (`PENDING`, `IN_REVIEW`, `UPHELD`, `OVERTURNED`) with audit notes/outcome.

## 7.5 Promotions and checkout

Core entities:

- `Promotion`, `PromotionExclusion`, `PromotionItem`, `AppliedPromotion`.

Design properties:

- effective date window,
- priority ordering,
- mutual exclusion table,
- persisted “reason applied” trail for explainability.

## 7.6 Search and reporting

Core entities:

- `ProductAttribute`, `SearchLog`, `SuggestedTerm`,
- `KpiDaily`, `ReportReviewEfficiency`, `ScheduledReport`, `RateLimitLog`.

Design properties:

- full-text search on items,
- query logging + suggestions/trending,
- scheduled in-app report generation and download.

---

## 8. Key Business Logic (Implemented)

## 8.1 Inventory workflows

- **Receiving**
  - supports itemId or barcode resolution,
  - validates lot/expiration requirements,
  - upserts lot and stock level,
  - writes ledger entry (`RECEIVING`).

- **Issue**
  - validates stock availability,
  - prevents negative stock,
  - writes ledger entry (`ISSUE`).

- **Transfer**
  - blocks same-source/destination transfers,
  - validates source stock,
  - decrements source/increments destination transactionally,
  - writes ledger entry (`TRANSFER`).

- **Stock count**
  - starts in `DRAFT`,
  - computes variance per line,
  - finalization promotes to `PENDING_APPROVAL` when aggregate variance exceeds configured threshold,
  - else auto-approves and applies stock adjustments with ledger entries (`STOCK_COUNT`).

- **Low-stock**
  - API computes threshold as `max(safetyThreshold, avgDailyUsage * 7)` and flags low inventory.

## 8.2 Reviews and trust controls

- content filtering against local sensitive-word dictionary,
- review rate limiting (3 create-review actions per user per hour),
- follow-up window: 7 days, single follow-up per parent,
- host reply window: 14 days, one reply per review,
- trust delta map for task ratings: `5★:+2`, `4★:+1`, `3★:0`, `2★:-1`, `1★:-2`, clamped to `[0,100]`.

## 8.3 Moderation governance

- users can file reports on content,
- moderators/admin can assign and act on queue items,
- review status side-effects applied on hide/remove/restore,
- appeals enforce state transitions and can restore content when overturned.

## 8.4 Promotion engine

- evaluates active promotions valid at current time,
- applies deterministic selection:
  1.  highest priority first,
  2.  for same priority, higher savings,
  3.  exclusion constraints respected bidirectionally,
- stores applied promotion record for traceability.

## 8.5 Search and analytics

- keyword search uses MySQL full-text (`MATCH...AGAINST` in boolean mode),
- optional category/attribute filters,
- cached paginated results,
- suggestion frequency tracking and trending curation.

---

## 9. Security and Compliance Controls

## 9.1 Authentication and authorization

- JWT-based auth
- role-based access control in both backend middleware and frontend route guards

## 9.2 Data protection

- per-user salt + hashed passwords,
- AES-256-GCM encryption utility for sensitive stored fields,
- masked phone representation for display use-cases,
- export watermarking with requester username + timestamp.

## 9.3 Access restrictions

Implemented access boundaries include:

- vendor cost visibility restricted for non-admin contexts,
- moderation audit and sensitive operations restricted to privileged roles,
- admin-only user management paths.

## 9.4 Upload safety

- file upload constraints via Multer:
  - max 6 images,
  - max 5 MB per file,
  - MIME checks.

---

## 10. Performance and Reliability Design

## 10.1 Caching

In-memory TTL cache (`lib/cache.ts`) used for:

- search result sets,
- search suggestions/trending,
- KPI dashboard snapshots,
- sensitive-word dictionary reload optimization.

Default TTL configuration: 15 minutes.

## 10.2 Scheduling

Cron jobs registered in `lib/scheduler.ts` include:

- nightly KPI aggregation,
- nightly average usage update,
- nightly low-stock check,
- nightly review-efficiency aggregation,
- scheduled report processor (every minute),
- cache cleanup (every 30 minutes).

## 10.3 Transactional integrity

Critical workflows (`transfer`, stock-count approval application, moderation+status transitions) are wrapped in database transactions to preserve consistency.

---

## 11. Reporting and Export Design

## 11.1 KPI and review-efficiency views

- `/reports/kpi/dashboard` returns recent KPI rows (manager/admin)
- `/reports/review-efficiency` returns moderation efficiency rows

## 11.2 Scheduled report pipeline

1. user schedules report (`PENDING`)
2. processor picks due reports and marks `PROCESSING`
3. generator builds data set by report type
4. exporter writes CSV or Excel to disk under uploads/reports
5. status transitions to `READY` (or `FAILED`)
6. authorized user downloads via `/reports/scheduled/:id/download`

---

## 12. Observability and Error Handling

- structured logging via `pino` (`lib/logger.ts`)
- request logging middleware for API telemetry
- centralized error handler for consistent error responses
- business exceptions standardized with code + status

---

## 13. Testing Strategy

Automated tests are split into two suites:

- `unit_tests/` for pure/domain logic and utilities
- `API_tests/` for endpoint contracts and RBAC behavior

The project provides a root `run_tests.sh` to execute both suites.

---

## 14. Design Constraints and Known Trade-offs

1. **Offline-first local runtime**: no external SaaS dependencies by design.
2. **In-memory cache scope**: cache is process-local (no distributed cache layer).
3. **Scheduled time semantics**: scheduled report execution currently depends on server-side timestamp comparisons.
4. **Promotion strategy**: deterministic and explainable, but not a global cart-optimization solver.

---

## 15. Future Design Extensions (Optional)

- Explicit timezone policy for scheduled reports per user/location.
- Consistent dynamic threshold use in all low-stock checks.
- Expanded anti-spam policy scope to follow-up/reply events if business requires.
- Formula standardization for all KPI fields (AOV/repurchase/refund) with product-owner sign-off.
