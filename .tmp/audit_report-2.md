# HarborOps Delivery Acceptance & Project Architecture Audit (Static-Only, Re-Run)

Date: 2026-04-07

## 1. Verdict

- **Overall conclusion: Partial Pass**

Reasoning (root-cause level):

- Core business modules are now broadly implemented and wired (inventory, reviews/trust/moderation, promotions, search, reporting/KPI/risk).
- Security and quality posture improved materially (rate-limit coverage extended, risk-reporting implemented, test coupling improved).
- However, a **material security issue remains**: committed weak `.env` secrets still satisfy production compose requirements, creating an insecure accidental deployment path.
- A second material security concern remains: upload access is authenticated but not object-authorized.

---

## 2. Scope and Static Verification Boundary

### What was reviewed

- Documentation/config/manifests:
  - `repo/README.md`, `repo/docker-compose.yml`, `repo/.env`, `repo/.env.example`, `repo/run_tests.sh`
- Backend entrypoints/security/business logic:
  - `repo/backend/src/index.ts`, `repo/backend/src/config/index.ts`, `repo/backend/src/middleware/auth.ts`, `repo/backend/src/middleware/requestLogger.ts`, `repo/backend/src/middleware/upload.ts`
  - `repo/backend/src/modules/**` (inventory/reviews/moderation/promotions/search/reports/trust/users routes/services)
  - `repo/backend/src/lib/*` (scheduler, kpi aggregator, encryption, exporter)
  - `repo/backend/prisma/schema.prisma`
- Frontend structure/routing/views:
  - `repo/frontend/src/router/index.ts`, `repo/frontend/src/components/AppLayout.vue`, `repo/frontend/src/views/reviews/ReviewDetail.vue`
- Tests/configs (static-only):
  - `repo/API_tests/*.test.ts`, `repo/unit_tests/*.test.ts`
  - `repo/backend/vitest.unit.config.ts`, `repo/backend/vitest.api.config.ts`, `repo/API_tests/vitest.config.ts`, `repo/unit_tests/vitest.config.ts`

### What was not reviewed

- Runtime behavior under live server/browser/database execution.
- Real scheduler execution timing, long-run cache behavior, and concurrent race outcomes.

### What was intentionally not executed

- Project startup, Docker, tests, external integrations.

### Claims requiring manual verification

- Browser-level UX quality and visual consistency under real rendering.
- Runtime performance/SLA behavior (query latency, cache hit rate, scheduler drift).
- End-to-end authorization behavior for uploaded media under realistic user/file ownership scenarios.

---

## 3. Repository / Requirement Mapping Summary

### Prompt core goal/flows/constraints (condensed)

- Multi-location inventory operations with immutable ledger, lot/expiration traceability, low-stock thresholds, and manager variance approval.
- Review/trust governance with anti-spam, moderation queue, appeals, and role boundaries.
- Deterministic promotions with priority/exclusion and explainable discounts.
- Search with full-text, filtering/sorting/suggestions/trending.
- Nightly KPI/review-efficiency/risk reporting and scheduled in-app downloads.
- Offline security: hashed+salted passwords, encrypted sensitive fields, masked UI fields, RBAC for sensitive areas.

### Mapped implementation areas

- Backend module registration and route surface: `repo/backend/src/index.ts:55-64`.
- Security middleware + RBAC enforcement: `repo/backend/src/middleware/auth.ts:7-27`.
- Inventory/reviews/promotions/search/reports/trust service implementations and tests.
- Prisma schema for full-text/indexing/reporting/rate-limit models: e.g., `repo/backend/prisma/schema.prisma:108,614+,661+`.

---

## 4. Section-by-section Review

## 4.1 Hard Gates

### 4.1.1 Documentation and static verifiability

- **Conclusion: Partial Pass**
- **Rationale:** Startup/testing structure and evidence are present; however, security guidance and actual committed env usage remain risky.
- **Evidence:**
  - Test entry/docs: `repo/README.md:117-118`, `repo/run_tests.sh:13-21,27-49`
  - Security note acknowledges weak committed env: `repo/README.md:18`
  - Compose requires secrets: `repo/docker-compose.yml:39-40`
  - Committed weak values still present: `repo/.env:9-10`
- **Manual verification note:** None.

### 4.1.2 Material deviation from Prompt

- **Conclusion: Pass**
- **Rationale:** Core prompt domains now map to concrete code paths (including previously missing KPI/risk reporting).
- **Evidence:**
  - KPI computation implementation: `repo/backend/src/lib/kpiDailyAggregator.ts:35,57,76,139,150,160,163`
  - Risk report type + processor: `repo/backend/src/modules/reports/reports.routes.ts:14`, `repo/backend/src/modules/reports/reports.processor.ts:76,126`
  - Scheduler jobs: `repo/backend/src/lib/scheduler.ts:29-38,108-129,131-151`

## 4.2 Delivery Completeness

### 4.2.1 Core explicit requirements coverage

- **Conclusion: Partial Pass**
- **Rationale:** Most explicit requirements are implemented; remaining gaps are security-hardening details (env secret hygiene, upload object authorization).
- **Evidence:**
  - Inventory constraints + traceability: `repo/backend/src/modules/inventory/inventory.service.ts:264-268,343,371,426`
  - Variance approval rules: `repo/backend/src/modules/inventory/inventory.utils.ts:53-74`
  - Low-stock formula: `repo/backend/src/modules/inventory/inventory.utils.ts:14-23`, mirrored in `repo/backend/src/lib/scheduler.ts:74-95`
  - Reviews governance windows/rate-limits: `repo/backend/src/modules/reviews/reviews.service.ts:169,184,252,261`
  - Promotions deterministic conflict logic: `repo/backend/src/modules/promotions/promotions.service.ts:164,211-214`
  - Search full-text/filter/cache/trending RBAC: `repo/backend/src/modules/search/search.service.ts:6,47`, `repo/backend/src/modules/search/search.routes.ts:56`
  - Reporting scheduled downloads: `repo/backend/src/modules/reports/reports.routes.ts:141-167`
- **Manual verification note:** Runtime UX and heavy-data behavior are Manual Verification Required.

### 4.2.2 End-to-end deliverable from 0→1

- **Conclusion: Pass**
- **Rationale:** Complete multi-folder full-stack structure with backend, frontend, schema, jobs, and tests exists.
- **Evidence:**
  - Full route registration breadth: `repo/backend/src/index.ts:55-64`
  - Frontend role routes: `repo/frontend/src/router/index.ts:21-47`
  - Test suites/configs: `repo/backend/vitest.unit.config.ts:8`, `repo/backend/vitest.api.config.ts:8`, `repo/README.md:125-126`

## 4.3 Engineering and Architecture Quality

### 4.3.1 Structure and module decomposition

- **Conclusion: Pass**
- **Rationale:** Responsibilities are separated across middleware, modules, libs, and route/controller/service layers.
- **Evidence:**
  - Module-based API composition: `repo/backend/src/index.ts:55-64`
  - Domain-specific routes with RBAC: `repo/backend/src/modules/moderation/moderation.routes.ts:9-16,24-28`

### 4.3.2 Maintainability/extensibility

- **Conclusion: Partial Pass**
- **Rationale:** Generally maintainable; one policy drift remains where review create limit is hardcoded instead of using config like follow-up/reply.
- **Evidence:**
  - Configurable limits exist: `repo/backend/src/config/index.ts:68-70`
  - Hardcoded review limiter still used: `repo/backend/src/modules/reviews/reviews.service.ts:40`
  - Follow-up/reply correctly use config: `repo/backend/src/modules/reviews/reviews.service.ts:184,261`

## 4.4 Engineering Details and Professionalism

### 4.4.1 Error handling / logging / validation / API design

- **Conclusion: Partial Pass**
- **Rationale:** Good error envelopes and validation patterns; meaningful logging present; remaining material security defects prevent full pass.
- **Evidence:**
  - Auth failures and token validation: `repo/backend/src/middleware/auth.ts:10,20,24-27`
  - Request logging fields (without body dump): `repo/backend/src/middleware/requestLogger.ts:8-14`
  - Review/inventory/report errors use explicit codes/statuses in services/routes.

### 4.4.2 Product-like delivery vs demo-only

- **Conclusion: Pass**
- **Rationale:** System resembles production architecture, not a teaching snippet.
- **Evidence:**
  - Scheduler/report/export/security subsystems present across backend libs/modules.
  - Frontend role-based menu/workspaces: `repo/frontend/src/components/AppLayout.vue:120-181`.

## 4.5 Prompt Understanding and Requirement Fit

### 4.5.1 Business semantics and implicit constraints fit

- **Conclusion: Partial Pass**
- **Rationale:** Prompt semantics are mostly respected, but two security constraints remain weaker than expected in practice.
- **Evidence:**
  - Vendor cost gating by admin in ledger/export: `repo/backend/src/modules/inventory/inventory.controller.ts:279`, `repo/backend/src/modules/inventory/inventory.service.ts:714,725,747`
  - Credit-rule admin-only: `repo/backend/src/modules/trust/trust.routes.ts:45-47,64-66,85-87`
  - Moderation audit admin-only: `repo/backend/src/modules/moderation/moderation.routes.ts:16`
  - Remaining upload object-auth gap: `repo/backend/src/index.ts:44-45`

## 4.6 Aesthetics (frontend/full-stack)

### 4.6.1 Visual and interaction quality fit

- **Conclusion: Cannot Confirm Statistically**
- **Rationale:** Static evidence shows role menus/hover states/layout intent, but actual rendering consistency requires browser runtime.
- **Evidence:**
  - Role-based menu composition: `repo/frontend/src/components/AppLayout.vue:120-181`
  - Interaction styling hints: `repo/frontend/src/components/AppLayout.vue:40`
  - Route-workspace mapping: `repo/frontend/src/router/index.ts:21-47`
- **Manual verification note:** Browser/device checks required for visual quality assertions.

---

## 5. Issues / Suggestions (Severity-Rated)

## High

### 1) High — Committed weak `.env` secrets still create an insecure production path

- **Conclusion:** Fail
- **Evidence:**
  - Compose production mode + required env vars: `repo/docker-compose.yml:36,39-40`
  - Committed weak secret values satisfy those vars: `repo/.env:9-10`
  - README acknowledges known-weak committed env values: `repo/README.md:18`
- **Impact:** A default `docker compose up` can run with predictable JWT/encryption keys, weakening authentication token integrity and at-rest encryption assumptions.
- **Minimum actionable fix:** Remove sensitive values from committed `.env`; keep only `.env.example` placeholders; enforce startup validation that blocks known placeholder/weak values in production.
- **Minimal verification path:** Static check that `.env` is no longer committed with real/weak keys and production startup checks reject weak patterns.

## Medium

### 2) Medium — Upload retrieval is authenticated but not object-authorized

- **Conclusion:** Partial Fail / Suspected Risk
- **Evidence:**
  - Upload endpoint requires JWT only: `repo/backend/src/index.ts:44`
  - Endpoint serves by filename from upload directory without ownership/resource check: `repo/backend/src/index.ts:45-47`
  - Frontend uses direct file path tokenized URL: `repo/frontend/src/views/reviews/ReviewDetail.vue:77`
- **Impact:** Any authenticated user with a known/leaked filename can potentially access unrelated review media.
- **Minimum actionable fix:** Move to resource-based authorization (`/api/reviews/:id/images/:imageId`) with owner/role checks; map file access through DB ownership instead of raw filename.
- **Minimal verification path:** Add API tests proving cross-user access gets 403 for non-owned review images.

### 3) Medium — Anti-spam policy drift: top-level review limit is hardcoded while config exists

- **Conclusion:** Partial Fail
- **Evidence:**
  - Config exposes `reviewsPerHour`: `repo/backend/src/config/index.ts:68`
  - `createReview` still hardcodes text/threshold at 3: `repo/backend/src/modules/reviews/reviews.service.ts:40`
  - Follow-up/reply correctly use config values: `repo/backend/src/modules/reviews/reviews.service.ts:184,261`
- **Impact:** Configuration changes may not apply consistently across write paths; operational policy can drift silently.
- **Minimum actionable fix:** Replace hardcoded review threshold/message with `config.rateLimit.reviewsPerHour`.
- **Minimal verification path:** Static assertion in tests that configured value changes behavior uniformly for all review write actions.

---

## 6. Security Review Summary

### Authentication entry points

- **Conclusion: Pass**
- **Evidence:** JWT auth middleware verifies bearer token and returns 401 on missing/invalid tokens (`repo/backend/src/middleware/auth.ts:7-20`); auth routes and tests exist (`repo/API_tests/auth.test.ts:5,62,79`).

### Route-level authorization

- **Conclusion: Pass**
- **Evidence:** Broad RBAC on sensitive routes, e.g., users admin endpoints (`repo/backend/src/modules/users/users.routes.ts:13,44`), moderation queue/audit (`repo/backend/src/modules/moderation/moderation.routes.ts:9,16`), trust admin credit-rules (`repo/backend/src/modules/trust/trust.routes.ts:45-47`).

### Object-level authorization

- **Conclusion: Partial Pass**
- **Evidence:**
  - Positive examples: review follow-up ownership (`repo/backend/src/modules/reviews/reviews.service.ts:163`), host reply ownership (`:246`), scheduled report ownership checks (`repo/backend/src/modules/reports/reports.routes.ts:120,154`).
  - Gap: uploads endpoint lacks object-level ownership gate (`repo/backend/src/index.ts:44-47`).

### Function-level authorization

- **Conclusion: Pass**
- **Evidence:** Admin-only/role-limited functions on moderation audit, sensitive words, trust credit-rules (`repo/backend/src/modules/moderation/moderation.routes.ts:16,28`; `repo/backend/src/modules/trust/trust.routes.ts:45-47,64-66,85-87`).

### Tenant / user data isolation

- **Conclusion: Partial Pass**
- **Evidence:** User-scoped report list and ownership checks (`repo/backend/src/modules/reports/reports.routes.ts:68,120,154`), appeals ownership tested (`repo/API_tests/moderation.test.ts:174`).
- **Reasoning:** No explicit multi-tenant boundary model; isolation appears user-scoped in key areas only.

### Admin / internal / debug endpoint protection

- **Conclusion: Pass**
- **Evidence:** Moderation audit/admin actions and trust credit-rule controls are admin guarded (`repo/backend/src/modules/moderation/moderation.routes.ts:16`; `repo/backend/src/modules/trust/trust.routes.ts:45-47,64-66,85-87`).

---

## 7. Tests and Logging Review

### Unit tests

- **Conclusion: Pass**
- **Rationale:** Unit tests exist and now import production modules/utilities rather than mirrored local logic for key prior gaps.
- **Evidence:**
  - Inventory utils imports: `repo/unit_tests/inventory.test.ts:2-8`
  - Moderation utils imports: `repo/unit_tests/moderation.test.ts:2-7`
  - KPI/risk/report aggregators covered: `repo/unit_tests/kpi.test.ts:7`, `repo/unit_tests/riskReport.test.ts:1-8`, `repo/unit_tests/reportReviewEfficiency.test.ts:5`

### API / integration tests

- **Conclusion: Partial Pass**
- **Rationale:** Strong coverage of auth/RBAC/error-paths and business flows; limited explicit tests for upload object authorization and env-secret hardening path.
- **Evidence:**
  - Auth 401/409 paths: `repo/API_tests/auth.test.ts:24,34,79,120`
  - Inventory constraints: `repo/API_tests/inventory.test.ts:314-321,334-335,710-739`
  - Review anti-spam and follow-up/reply flows: `repo/API_tests/reviews.test.ts:233,386,459,493`
  - Moderation audit/appeals authz: `repo/API_tests/moderation.test.ts:132-136,174,182`
  - Reports ownership/RBAC: `repo/API_tests/reports.test.ts:41-53,182,192`

### Logging categories / observability

- **Conclusion: Pass**
- **Rationale:** Request and scheduler logs are structured and category-appropriate.
- **Evidence:**
  - Request logging fields: `repo/backend/src/middleware/requestLogger.ts:8-14`
  - Scheduler job lifecycle logs: `repo/backend/src/lib/scheduler.ts:16-24`

### Sensitive-data leakage risk in logs / responses

- **Conclusion: Partial Pass**
- **Rationale:** Request logger avoids body dumps; phone is encrypted/masked; export watermarking exists. Remaining media access concern is authorization, not direct logging leakage.
- **Evidence:**
  - Request logger fields only (no body): `repo/backend/src/middleware/requestLogger.ts:8-14`
  - AES + mask phone: `repo/backend/src/lib/encryption.ts:4,13,42-44`
  - Password+salt hashing/encrypted phone persistence: `repo/backend/src/modules/auth/auth.service.ts:19-23`
  - Export watermark username/timestamp: `repo/backend/src/lib/exporter.ts:12,36-37`

---

## 8. Test Coverage Assessment (Static Audit)

## 8.1 Test Overview

- Unit tests exist: **Yes** (`repo/backend/vitest.unit.config.ts:8`, `repo/unit_tests/vitest.config.ts:8`)
- API/integration tests exist: **Yes** (`repo/backend/vitest.api.config.ts:8`, `repo/API_tests/vitest.config.ts:8`)
- Frameworks: **Vitest** (API tests using Supertest patterns in files under `repo/API_tests/`)
- Test entry points: `repo/run_tests.sh:13-21,27-49`
- Documentation command: `repo/README.md:117-118`
- Boundary: Tests not executed in this audit.

## 8.2 Coverage Mapping Table

| Requirement / Risk Point                        | Mapped Test Case(s)                                                         | Key Assertion / Fixture / Mock                      | Coverage Assessment | Gap                                      | Minimum Test Addition                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Auth login/me guards                            | `repo/API_tests/auth.test.ts:5,62`                                          | 401 invalid/missing token at `:24,34,79`            | sufficient          | none major                               | add token-expiry boundary case                               |
| Route RBAC on sensitive endpoints               | `repo/API_tests/rbac.test.ts:9,20,38,54`                                    | guest/clerk 403 on admin/manager routes `:22,30,50` | basically covered   | matrix not exhaustive                    | add centralized endpoint-role matrix test                    |
| Inventory negative-stock / transfer guards      | `repo/API_tests/inventory.test.ts:314-321,334-335`                          | `INSUFFICIENT_STOCK`, `INVALID_TRANSFER` codes      | sufficient          | no concurrency race checks               | add parallel transfer/issue race test                        |
| Lot/expiration enforcement                      | `repo/API_tests/inventory.test.ts:710-739`                                  | `LOT_REQUIRED`, `EXPIRATION_REQUIRED` 422           | sufficient          | edge combinations limited                | add item-flag matrix tests                                   |
| Review anti-spam + duplicate/window constraints | `repo/API_tests/reviews.test.ts:139-154,233,386,459,493`                    | 409 duplicate, 403 ownership, 429 rate-limit        | basically covered   | global config drift not asserted         | add config-driven limit tests for all review write paths     |
| Moderation audit + appeals authz/isolation      | `repo/API_tests/moderation.test.ts:132-136,174,182`                         | admin-only audit; non-affected user appeal 403      | sufficient          | no deep arbitration-state fuzzing        | add transition/edge-state fuzz tests                         |
| Reports ownership and access control            | `repo/API_tests/reports.test.ts:41-53,94,182,192`                           | non-privileged 403, unauth 401, owner-scope access  | sufficient          | no stress tests on scheduling races      | add duplicate/parallel process race tests                    |
| Search filtering/sorting/trending access        | `repo/API_tests/search.test.ts:32,52,60,85`                                 | missing q -> 400, trending route tests              | basically covered   | limited pagination/sort stability checks | add page boundary + deterministic sort tests                 |
| KPI and risk analytics formulas                 | `repo/unit_tests/kpi.test.ts:1-8`, `repo/unit_tests/riskReport.test.ts:1-8` | pure-function/unit aggregator assertions            | basically covered   | no DB-shape integration assertions       | add mocked Prisma integration tests for full daily pipeline  |
| Upload media authorization                      | no direct mapped API test found                                             | N/A                                                 | missing             | cross-user image access not asserted     | add `/api/uploads` authorization tests with non-owner tokens |

## 8.3 Security Coverage Audit

- **Authentication:** well covered (auth suite has multiple 401 paths).
- **Route authorization:** well covered (RBAC + module-specific suites include many 403 checks).
- **Object-level authorization:** partially covered (follow-up/reports/appeals covered, uploads ownership not covered).
- **Tenant/data isolation:** partially covered via user-scoped report/appeal tests; no explicit tenant model tests.
- **Admin/internal protection:** covered for moderation audit and trust credit-rules.

Residual severe-defect blind spots:

- Insecure accidental secret usage via committed `.env` values is not test-guarded.
- Upload object-level authorization is not explicitly test-covered.

## 8.4 Final Coverage Judgment

- **Final Coverage Judgment: Partial Pass**

Why:

- Core happy paths and many authorization/error paths are covered.
- But tests could still pass while severe security defects remain (committed weak deploy secrets path, upload object-authorization gap).

---

## 9. Final Notes

- This report is strictly static and evidence-based.
- No runtime correctness/performance claims are made.
- Priority remediation order:
  1. Remove committed weak `.env` secrets and enforce secure production secret values.
  2. Add object-level authorization for uploaded media access.
  3. Eliminate review-rate-limit config drift by using `config.rateLimit.reviewsPerHour` in `createReview`.
