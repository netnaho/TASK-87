# HarborOps Issue Fix Verification (Re-Inspection #3, Static-Only)

Date: 2026-04-07  
Scope: Static code/document inspection only (no runtime execution)

## Executive status

- **Fixed:** 3
- **Partially fixed:** 0
- **Not fixed:** 0

## Detailed verification

| #   | Prior issue from previous inspection                                                     | Previous severity | Current status | Static evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------- | ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Committed weak `.env` secrets could still create an insecure production startup path     | High              | **Fixed**      | Compose still requires explicit secrets (`repo/docker-compose.yml:36,39-40`), and backend now enforces weak-secret rejection in production via `isWeakSecret` + `requireSecret` (`repo/backend/src/config/index.ts:32,51,55,97,101`). `.env` is now placeholder-based (`repo/.env:17-18`) instead of committed known weak runtime values.                                                                                                                                                                           |
| 2   | Upload retrieval was authenticated but not object-authorized                             | Medium            | **Fixed**      | Object-level authorization is implemented through canonical endpoint and shared service checks: `repo/backend/src/modules/reviews/reviews.routes.ts:17-19`, `repo/backend/src/modules/reviews/reviews.controller.ts:77`, `repo/backend/src/modules/reviews/reviews.service.ts:300,318,329,343,354`. Legacy `/api/uploads/:filename` shim now delegates to object-authorization logic (`repo/backend/src/index.ts:47,52`). Frontend uses canonical endpoint (`repo/frontend/src/views/reviews/ReviewDetail.vue:77`). |
| 3   | Anti-spam policy drift: top-level review limit hardcoded while config-based limits exist | Medium            | **Fixed**      | `createReview` now uses config-driven threshold/message: `repo/backend/src/modules/reviews/reviews.service.ts:40-41` (`config.rateLimit.reviewsPerHour`). Follow-up/reply remain config-driven (`repo/backend/src/modules/reviews/reviews.service.ts:182,259`). API tests cover RATE_LIMITED paths across review/follow-up/host-reply (`repo/API_tests/reviews.test.ts:233-297,439-473,510-544`).                                                                                                                   |

## Notes

- This verification intentionally remains static-only; no runtime success is claimed.
- Relative to Re-Inspection #2, the final remaining issue (create-review hardcoded rate limit) is now resolved.
